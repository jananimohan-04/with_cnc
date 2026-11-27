package com.arguscnc.erp.simcalls;

import android.Manifest;
import android.content.ContentUris;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Call recordings: Android does not let other apps record calls, but most phones' own dialer can (Samsung, Xiaomi,
 * Realme, OnePlus, Vivo, Oppo ...). That dialer saves an audio file per call. For every answered call on the company
 * SIM this finds the file saved at the end of that call (in a call-recording folder, same length as the call) and
 * uploads it to BI, attached to the call. Calls on the other SIM are never looked at.
 */
final class SimCallRecordings {
    private static final String PENDING = "recPending";
    private static final long KEEP_LOOKING_MS = 3 * 60 * 60 * 1000L;   // a recording appears right after the call
    // folders phone dialers save call recordings in ("Recordings/Call", "MIUI/sound_recorder/call_rec",
    // "Music/Recordings/Call Recordings", "Record/Call", "PhoneRecord" ...)
    private static final Pattern CALL_FOLDER = Pattern.compile("(?i)(call|phonerecord|phone_record|通话|voicecall)");

    private SimCallRecordings() {}

    static boolean canRead(Context c) {
        return SimCallSync.can(c, Build.VERSION.SDK_INT >= 33 ? Manifest.permission.READ_MEDIA_AUDIO : Manifest.permission.READ_EXTERNAL_STORAGE);
    }

    /** Remember answered calls to look for their recording. */
    static void queue(SharedPreferences p, JSONArray calls) {
        try {
            JSONArray list = new JSONArray(p.getString(PENDING, "[]"));
            for (int i = 0; i < calls.length(); i++) {
                JSONObject c = calls.getJSONObject(i);
                String type = c.optString("type");
                if (c.optLong("duration") <= 0 || !("incoming".equals(type) || "outgoing".equals(type))) continue;
                JSONObject o = new JSONObject();
                o.put("id", c.getLong("id")); o.put("date", c.getLong("date")); o.put("dur", c.getLong("duration"));
                o.put("num", c.optString("number")); o.put("tries", 0);
                list.put(o);
            }
            // keep the newest 200
            JSONArray out = new JSONArray();
            for (int i = Math.max(0, list.length() - 200); i < list.length(); i++) out.put(list.get(i));
            p.edit().putString(PENDING, out.toString()).apply();
        } catch (Exception ignored) { }
    }

    static int pendingCount(SharedPreferences p) {
        try { return new JSONArray(p.getString(PENDING, "[]")).length(); } catch (Exception e) { return 0; }
    }

    private static final class Audio {
        long id; String name; String mime; long addedMs; long modifiedMs; long durMs; long size;
    }

    private static List<Audio> recentRecordings(Context c, long sinceMs) {
        List<Audio> out = new ArrayList<>();
        String pathCol = Build.VERSION.SDK_INT >= 29 ? MediaStore.Audio.Media.RELATIVE_PATH : MediaStore.Audio.Media.DATA;
        String[] cols = { MediaStore.Audio.Media._ID, MediaStore.Audio.Media.DISPLAY_NAME, MediaStore.Audio.Media.MIME_TYPE,
                MediaStore.Audio.Media.DATE_ADDED, MediaStore.Audio.Media.DATE_MODIFIED, MediaStore.Audio.Media.DURATION,
                MediaStore.Audio.Media.SIZE, pathCol };
        try (Cursor cur = c.getContentResolver().query(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, cols,
                MediaStore.Audio.Media.DATE_MODIFIED + " >= ?", new String[] { String.valueOf(sinceMs / 1000) }, null)) {
            if (cur == null) return out;
            while (cur.moveToNext()) {
                String path = cur.getString(7) == null ? "" : cur.getString(7);
                String name = cur.getString(1) == null ? "" : cur.getString(1);
                if (!CALL_FOLDER.matcher(path).find() && !CALL_FOLDER.matcher(name).find()) continue;
                Audio a = new Audio();
                a.id = cur.getLong(0); a.name = name; a.mime = cur.getString(2) == null ? "audio/mpeg" : cur.getString(2);
                a.addedMs = cur.getLong(3) * 1000; a.modifiedMs = cur.getLong(4) * 1000; a.durMs = cur.getLong(5); a.size = cur.getLong(6);
                out.add(a);
            }
        } catch (Exception ignored) { }
        return out;
    }

    /** Finds and uploads recordings for the waiting calls. Never throws; problems are kept in lastRecError. */
    static void run(Context c) {
        SharedPreferences p = SimCallSync.prefs(c);
        String api = p.getString("api", "");
        String token = p.getString("token", "");
        if (api.isEmpty() || token.isEmpty() || !canRead(c)) return;
        JSONArray list;
        try { list = new JSONArray(p.getString(PENDING, "[]")); } catch (Exception e) { return; }
        if (list.length() == 0) return;

        long oldest = Long.MAX_VALUE;
        for (int i = 0; i < list.length(); i++) oldest = Math.min(oldest, list.optJSONObject(i).optLong("date"));
        List<Audio> files = recentRecordings(c, oldest - 60_000);
        Set<Long> used = new HashSet<>();
        JSONArray keep = new JSONArray();
        long now = System.currentTimeMillis();

        for (int i = 0; i < list.length(); i++) {
            JSONObject call = list.optJSONObject(i);
            if (call == null) continue;
            long start = call.optLong("date"), durMs = call.optLong("dur") * 1000, end = start + durMs;
            String digits = call.optString("num").replaceAll("\\D", "");
            String tail = digits.length() > 6 ? digits.substring(digits.length() - 6) : digits;
            Audio best = null; int bestScore = -1;
            for (Audio a : files) {
                if (used.contains(a.id)) continue;
                long t = Math.max(a.addedMs, a.modifiedMs);
                if (t < start - 30_000 || t > end + 5 * 60_000) continue;            // saved during / right after this call
                if (a.durMs > 0 && Math.abs(a.durMs - durMs) > Math.max(10_000, durMs / 5)) continue;   // same length
                int score = 1 + (tail.length() >= 6 && a.name.replaceAll("\\D", "").contains(tail) ? 2 : 0) + (a.durMs > 0 ? 1 : 0);
                if (score > bestScore) { best = a; bestScore = score; }
            }
            String result = best == null ? "none" : upload(c, p, api, token, call, best);
            if (best != null && !"retry".equals(result)) used.add(best.id);
            boolean finished = "done".equals(result) || "skip".equals(result);
            boolean tooOld = now - end > KEEP_LOOKING_MS;
            if (!finished && !tooOld) keep.put(call);
        }
        p.edit().putString(PENDING, keep.toString()).apply();
    }

    /** "done", "skip" (company off / not a usable file) or "retry". */
    private static String upload(Context c, SharedPreferences p, String api, String token, JSONObject call, Audio a) {
        try {
            String ext = a.name.contains(".") ? a.name.substring(a.name.lastIndexOf('.') + 1).toLowerCase() : "m4a";
            JSONObject start = new JSONObject();
            start.put("token", token); start.put("callId", call.getLong("id")); start.put("startedAt", call.getLong("date"));
            start.put("ext", ext); start.put("size", a.size);
            JSONObject r = postJson(api + "/api/simcalls/recording/start", start);
            if (r == null) return "retry";
            if (r.optBoolean("done") || r.optBoolean("skip")) return r.optBoolean("done") ? "done" : "skip";
            String url = r.optString("url", "");
            if (url.isEmpty()) return "retry";

            Uri uri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, a.id);
            HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
            con.setRequestMethod("PUT");
            con.setDoOutput(true);
            con.setConnectTimeout(20000);
            con.setReadTimeout(120000);
            con.setRequestProperty("Content-Type", a.mime);
            con.setRequestProperty("x-upsert", "true");
            if (a.size > 0) con.setFixedLengthStreamingMode(a.size);
            try (InputStream in = c.getContentResolver().openInputStream(uri); OutputStream os = con.getOutputStream()) {
                if (in == null) return "skip";
                byte[] buf = new byte[64 * 1024]; int n;
                while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
            }
            int code = con.getResponseCode();
            con.disconnect();
            if (code < 200 || code >= 300) { p.edit().putString("lastRecError", "Recording upload failed (" + code + ").").apply(); return "retry"; }

            JSONObject fin = new JSONObject();
            fin.put("token", token); fin.put("callId", call.getLong("id")); fin.put("startedAt", call.getLong("date"));
            JSONObject f = postJson(api + "/api/simcalls/recording/finish", fin);
            if (f == null || !f.optBoolean("ok")) return "retry";
            p.edit().putString("lastRecError", "").putLong("lastRecAt", System.currentTimeMillis()).apply();
            return "done";
        } catch (Exception e) {
            p.edit().putString("lastRecError", "Recording upload failed: " + e.getMessage()).apply();
            return "retry";
        }
    }

    /** POST JSON; returns the reply, or null when it should be tried again later. */
    private static JSONObject postJson(String url, JSONObject body) throws Exception {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setRequestMethod("POST");
        con.setDoOutput(true);
        con.setConnectTimeout(20000);
        con.setReadTimeout(30000);
        con.setRequestProperty("Content-Type", "application/json");
        try (OutputStream os = con.getOutputStream()) { os.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
        int code = con.getResponseCode();
        InputStream in = code >= 400 ? con.getErrorStream() : con.getInputStream();
        StringBuilder sb = new StringBuilder();
        if (in != null) try (InputStream s = in) { byte[] b = new byte[4096]; int n; while ((n = s.read(b)) > 0) sb.append(new String(b, 0, n, StandardCharsets.UTF_8)); }
        con.disconnect();
        JSONObject j;
        try { j = new JSONObject(sb.toString()); } catch (Exception e) { j = new JSONObject(); }
        if (code == 403) return j.put("skip", true);          // phone disconnected in BI
        if (code >= 200 && code < 300) return j;
        return null;
    }
}
