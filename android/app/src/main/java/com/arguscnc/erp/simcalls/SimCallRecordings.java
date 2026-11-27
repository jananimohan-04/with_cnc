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
    private static final long KEEP_LOOKING_MS = 24 * 60 * 60 * 1000L;  // a recording normally appears right after the call
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
            Set<Long> have = new HashSet<>();
            for (int i = 0; i < list.length(); i++) have.add(list.getJSONObject(i).optLong("id"));
            for (int i = 0; i < calls.length(); i++) {
                JSONObject c = calls.getJSONObject(i);
                String type = c.optString("type");
                if (c.optLong("duration") <= 0 || !("incoming".equals(type) || "outgoing".equals(type))) continue;
                if (!have.add(c.getLong("id"))) continue;   // already waiting
                JSONObject o = new JSONObject();
                o.put("id", c.getLong("id")); o.put("date", c.getLong("date")); o.put("dur", c.getLong("duration"));
                o.put("num", c.optString("number")); o.put("name", c.optString("name")); o.put("tries", 0);
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
        long id; String name; String folder; String mime; long addedMs; long modifiedMs; long durMs; long size;
        boolean callFolder;   // in / named like a call-recording folder
        boolean recording;    // Android marks it as a recording (Android 12+)
    }

    /** Every audio file on the phone saved since sinceMs (any folder: each phone brand uses its own). */
    private static List<Audio> recentAudio(Context c, long sinceMs) {
        List<Audio> out = new ArrayList<>();
        String pathCol = Build.VERSION.SDK_INT >= 29 ? MediaStore.Audio.Media.RELATIVE_PATH : MediaStore.Audio.Media.DATA;
        List<String> colList = new ArrayList<>(java.util.Arrays.asList(MediaStore.Audio.Media._ID, MediaStore.Audio.Media.DISPLAY_NAME,
                MediaStore.Audio.Media.MIME_TYPE, MediaStore.Audio.Media.DATE_ADDED, MediaStore.Audio.Media.DATE_MODIFIED,
                MediaStore.Audio.Media.DURATION, MediaStore.Audio.Media.SIZE, pathCol));
        if (Build.VERSION.SDK_INT >= 31) colList.add(MediaStore.Audio.Media.IS_RECORDING);
        String[] cols = colList.toArray(new String[0]);
        long sinceSec = sinceMs / 1000;
        try (Cursor cur = c.getContentResolver().query(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, cols,
                MediaStore.Audio.Media.DATE_MODIFIED + " >= ? OR " + MediaStore.Audio.Media.DATE_ADDED + " >= ?",
                new String[] { String.valueOf(sinceSec), String.valueOf(sinceSec) }, null)) {
            if (cur == null) return out;
            while (cur.moveToNext()) {
                String path = cur.getString(7) == null ? "" : cur.getString(7);
                String name = cur.getString(1) == null ? "" : cur.getString(1);
                Audio a = new Audio();
                a.id = cur.getLong(0); a.name = name; a.mime = cur.getString(2) == null ? "audio/mpeg" : cur.getString(2);
                a.addedMs = cur.getLong(3) * 1000; a.modifiedMs = cur.getLong(4) * 1000; a.durMs = cur.getLong(5); a.size = cur.getLong(6);
                if (Build.VERSION.SDK_INT < 29 && path.contains("/")) path = path.substring(0, path.lastIndexOf('/') + 1).replaceFirst("^/storage/emulated/\\d+/", "");
                a.folder = path;
                a.callFolder = CALL_FOLDER.matcher(path).find() || CALL_FOLDER.matcher(name).find();
                a.recording = Build.VERSION.SDK_INT >= 31 && cur.getInt(8) == 1;
                out.add(a);
            }
        } catch (Exception ignored) { }
        return out;
    }

    /** What the phone has, shown in the app so anyone can see why recordings are (not) found. */
    private static void diagnose(Context c, SharedPreferences p) {
        List<Audio> recent = recentAudio(c, System.currentTimeMillis() - 3 * 86400_000L);
        java.util.Map<String, Integer> folders = new java.util.LinkedHashMap<>();
        for (Audio a : recent) { String f = a.folder.isEmpty() ? "(phone storage)" : a.folder.replaceAll("/+$", ""); folders.put(f, folders.getOrDefault(f, 0) + 1); }
        String text;
        if (recent.isEmpty()) {
            text = "No audio saved on this phone in the last 3 days, so the phone's dialer is not recording calls here (or keeps its recordings private, like the Google Phone app). Turn on call recording in the phone's own Phone app.";
        } else {
            StringBuilder sb = new StringBuilder("Audio saved on this phone in the last 3 days: ");
            int n = 0;
            for (java.util.Map.Entry<String, Integer> e : folders.entrySet()) { if (n++ == 4) break; if (n > 1) sb.append(", "); sb.append(e.getKey()).append(" (").append(e.getValue()).append(")"); }
            sb.append(". None of it matches a company-SIM call (saved at the end of the call, same length).");
            text = sb.toString();
        }
        p.edit().putString("recDiag", text).apply();
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
        // the media list may register a recording long after the call, so look further back than the calls
        List<Audio> files = recentAudio(c, oldest - 2 * 86400_000L);
        Set<Long> used = new HashSet<>();
        JSONArray keep = new JSONArray();
        long now = System.currentTimeMillis();
        String nearestNote = "";

        for (int i = 0; i < list.length(); i++) {
            JSONObject call = list.optJSONObject(i);
            if (call == null) continue;
            long start = call.optLong("date"), durMs = call.optLong("dur") * 1000, end = start + durMs;
            String digits = call.optString("num").replaceAll("\\D", "");
            String tail = digits.length() > 6 ? digits.substring(digits.length() - 6) : digits;
            String contact = simplify(call.optString("name"));
            Audio best = null; int bestScore = -1;
            Audio nearest = null; long nearestGap = Long.MAX_VALUE;
            for (Audio a : files) {
                if (used.contains(a.id)) continue;
                boolean nameHasNumber = tail.length() >= 6 && a.name.replaceAll("\\D", "").contains(tail);
                boolean nameHasContact = contact.length() >= 3 && simplify(a.name).contains(contact);
                boolean looksLikeCall = a.callFolder || a.recording || nameHasNumber || nameHasContact;
                // when it was recorded: the time in the file name (most reliable), else either media timestamp.
                // Outgoing calls ring before they are answered, so the recording can start up to ~90 s after the
                // call-history time and end up to a few minutes after.
                long fileTime = timeInName(a.name);
                boolean inTime = (fileTime > 0 && fileTime >= start - 60_000 && fileTime <= end + 3 * 60_000)
                        || within(a.addedMs, start, end) || within(a.modifiedMs, start, end);
                long gap = Math.abs((fileTime > 0 ? fileTime : a.modifiedMs) - start);
                if (looksLikeCall && gap < nearestGap) { nearest = a; nearestGap = gap; }
                if (!inTime) continue;
                long diff = a.durMs > 0 ? Math.abs(a.durMs - durMs) : Long.MAX_VALUE;
                // the file name says it started with this call (names may carry only minutes, and outgoing calls ring
                // first) and it is a call recording: recorders often start late or stop early, so it may be shorter
                boolean namedAtStart = fileTime > 0 && fileTime >= start - 90_000 && fileTime <= start + 150_000;
                boolean sameLength;
                if (looksLikeCall && namedAtStart) sameLength = a.durMs <= 0 || a.durMs <= durMs + 15_000;
                // a call-recording file: about the same length (or length unknown);
                // any other audio file: must be the same length within a few seconds
                else if (looksLikeCall) sameLength = a.durMs <= 0 || diff <= Math.max(15_000, durMs / 4);
                else sameLength = a.durMs > 0 && diff <= Math.max(4_000, durMs / 20);
                if (!sameLength) continue;
                int score = 1 + (nameHasNumber ? 3 : 0) + (nameHasContact ? 3 : 0) + (a.callFolder ? 2 : 0) + (a.recording ? 2 : 0)
                        + (namedAtStart ? 2 : fileTime > 0 ? 1 : 0) + (a.durMs > 0 && diff <= 5_000 ? 1 : 0);
                if (score > bestScore) { best = a; bestScore = score; }
            }
            if (best == null && nearest != null && nearestNote.isEmpty()) {
                long ft = timeInName(nearest.name);
                nearestNote = " Closest file to the call at " + clock(start) + " (" + durMs / 1000 + " s): \"" + nearest.name + "\", "
                        + (ft > 0 ? "named " + clock(ft) + ", " : "") + "saved " + clock(nearest.modifiedMs) + ", " + nearest.durMs / 1000 + " s.";
            }
            String result = best == null ? "none" : upload(c, p, api, token, call, best);
            if (best != null && !"retry".equals(result)) used.add(best.id);
            boolean finished = "done".equals(result) || "skip".equals(result);
            boolean tooOld = now - end > KEEP_LOOKING_MS;
            if (!finished && !tooOld) keep.put(call);
        }
        p.edit().putString(PENDING, keep.toString()).apply();
        if (keep.length() > 0) { diagnose(c, p); p.edit().putString("recDiag", p.getString("recDiag", "") + nearestNote).apply(); }
        else p.edit().putString("recDiag", "").apply();
    }

    /** A media timestamp inside the call (from a little before it starts to a few minutes after it ends). */
    private static boolean within(long t, long start, long end) {
        return t > 0 && t >= start - 60_000 && t <= end + 5 * 60_000;
    }

    private static String simplify(String s) {
        return s == null ? "" : s.toLowerCase().replaceAll("[^\\p{L}\\p{N}]", "");
    }

    private static String clock(long ms) {
        return new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US).format(new java.util.Date(ms));
    }

    // "..._20261127141530.m4a", "2026-11-27 14-15-30", "20261127_141530", "261127_141530", and without seconds
    // "BVK-2611271329.mp3" (phone's local time)
    private static final Pattern NAME_TIME = Pattern.compile("(?<!\\d)(20\\d{2}|\\d{2})[-_.]?(\\d{2})[-_.]?(\\d{2})[ _\\-T]?(\\d{2})[-_.:]?(\\d{2})(?:[-_.:]?(\\d{2}))?(?!\\d)");

    /** The recording time written in the file name, or 0. */
    static long timeInName(String name) {
        java.util.regex.Matcher m = NAME_TIME.matcher(name == null ? "" : name);
        while (m.find()) {
            try {
                int y = Integer.parseInt(m.group(1)); if (y < 100) y += 2000;
                int mo = Integer.parseInt(m.group(2)), d = Integer.parseInt(m.group(3));
                int h = Integer.parseInt(m.group(4)), mi = Integer.parseInt(m.group(5)), s = m.group(6) == null ? 0 : Integer.parseInt(m.group(6));
                if (y < 2020 || y > 2039 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) continue;
                java.util.Calendar cal = java.util.Calendar.getInstance();
                cal.set(y, mo - 1, d, h, mi, s); cal.set(java.util.Calendar.MILLISECOND, 0);
                return cal.getTimeInMillis();
            } catch (Exception ignored) { }
        }
        return 0;
    }

    /** "done", "skip" (company off / not a usable file) or "retry". */
    private static String upload(Context c, SharedPreferences p, String api, String token, JSONObject call, Audio a) {
        try {
            String ext = a.name.contains(".") ? a.name.substring(a.name.lastIndexOf('.') + 1).toLowerCase() : "m4a";
            // the real file size (the media list's size can be out of date)
            Uri uri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, a.id);
            long size = -1;
            try (android.os.ParcelFileDescriptor fd = c.getContentResolver().openFileDescriptor(uri, "r")) { if (fd != null) size = fd.getStatSize(); }
            catch (Exception ignored) { }
            byte[] whole = null;
            if (size <= 0) {   // size unknown: read it into memory (recordings are small)
                try (InputStream in = c.getContentResolver().openInputStream(uri)) {
                    if (in == null) return "skip";
                    java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[64 * 1024]; int n;
                    while ((n = in.read(buf)) > 0) { bo.write(buf, 0, n); if (bo.size() > 50L * 1024 * 1024) return "skip"; }
                    whole = bo.toByteArray(); size = whole.length;
                }
            }
            if (size <= 0) return "skip";

            JSONObject start = new JSONObject();
            start.put("token", token); start.put("callId", call.getLong("id")); start.put("startedAt", call.getLong("date"));
            start.put("ext", ext); start.put("size", size);
            JSONObject r = postJson(api + "/api/simcalls/recording/start", start);
            if (r == null) return "retry";
            if (r.optBoolean("missing")) return "skip";   // the call is not in BI (made before the SIM was connected)
            if (r.optBoolean("done") || r.optBoolean("skip")) return r.optBoolean("done") ? "done" : "skip";
            String url = r.optString("url", "");
            if (url.isEmpty()) return "retry";

            HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
            con.setRequestMethod("PUT");
            con.setDoOutput(true);
            con.setConnectTimeout(20000);
            con.setReadTimeout(120000);
            con.setRequestProperty("Content-Type", a.mime);
            con.setRequestProperty("x-upsert", "true");
            con.setFixedLengthStreamingMode(size);
            try (OutputStream os = con.getOutputStream()) {
                if (whole != null) os.write(whole);
                else try (InputStream in = c.getContentResolver().openInputStream(uri)) {
                    if (in == null) return "skip";
                    byte[] buf = new byte[64 * 1024]; int n; long left = size;
                    while (left > 0 && (n = in.read(buf, 0, (int) Math.min(buf.length, left))) > 0) { os.write(buf, 0, n); left -= n; }
                    if (left > 0) return "retry";   // the file got shorter while reading: try again later
                }
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
        // phone disconnected in BI: stop; any other refusal (server busy, being updated ...) is tried again later
        if (code == 403 && j.optString("error").contains("no longer connected")) return j.put("skip", true);
        if (code >= 200 && code < 300) return j;
        if (code == 404 && j.optString("error").contains("not saved")) return j.put("missing", true);
        return null;
    }
}
