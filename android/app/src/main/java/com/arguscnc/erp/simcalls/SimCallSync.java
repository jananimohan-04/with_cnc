package com.arguscnc.erp.simcalls;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.os.Build;
import android.provider.CallLog;
import android.telecom.PhoneAccountHandle;
import android.telecom.TelecomManager;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;
import android.telephony.TelephonyManager;

import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * Copies the calls of the chosen company SIM from the phone's call history to BI.
 * Runs from the app (on open / after a call) and from a background job every 15 minutes, so calls are saved even
 * when the app is closed. Only calls on the chosen SIM are sent; the phone's other SIM is never read out.
 */
public final class SimCallSync {
    static final String PREFS = "argus_sim_calls";
    static final String WORK_PERIODIC = "argus-sim-calls-periodic";
    static final String WORK_NOW = "argus-sim-calls-now";
    private static final int BATCH = 400;

    private SimCallSync() {}

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static boolean isConnected(Context c) {
        SharedPreferences p = prefs(c);
        return p.getString("token", "").length() > 0 && p.getInt("subId", -1) >= 0;
    }

    static boolean can(Context c, String perm) {
        return ContextCompat.checkSelfPermission(c, perm) == PackageManager.PERMISSION_GRANTED;
    }

    // ------------------------------------------------------------------ scheduling
    static void schedule(Context c) {
        Constraints net = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest periodic = new PeriodicWorkRequest.Builder(SimCallWorker.class, 15, TimeUnit.MINUTES)
                .setConstraints(net).build();
        WorkManager.getInstance(c).enqueueUniquePeriodicWork(WORK_PERIODIC, ExistingPeriodicWorkPolicy.KEEP, periodic);
    }

    /** Send soon (the phone writes a call to its history a moment after it ends). */
    static void soon(Context c, long delaySeconds) {
        if (!isConnected(c)) return;
        Constraints net = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        OneTimeWorkRequest once = new OneTimeWorkRequest.Builder(SimCallWorker.class)
                .setConstraints(net).setInitialDelay(delaySeconds, TimeUnit.SECONDS).build();
        WorkManager.getInstance(c).enqueueUniqueWork(WORK_NOW, ExistingWorkPolicy.REPLACE, once);
    }

    static void cancel(Context c) {
        WorkManager.getInstance(c).cancelUniqueWork(WORK_PERIODIC);
        WorkManager.getInstance(c).cancelUniqueWork(WORK_NOW);
    }

    // ------------------------------------------------------------------ which call-history rows belong to the SIM
    /** The phone's calling-account ids that belong to this SIM (call history marks every call with one). */
    static Set<String> accountIdsFor(Context c, int subId, String iccId) {
        Set<String> ids = new HashSet<>();
        ids.add(String.valueOf(subId));
        if (iccId != null && iccId.length() > 0) ids.add(iccId);
        if (!can(c, Manifest.permission.READ_PHONE_STATE)) return ids;
        try {
            TelecomManager tm = c.getSystemService(TelecomManager.class);
            TelephonyManager tel = c.getSystemService(TelephonyManager.class);
            List<PhoneAccountHandle> handles = tm.getCallCapablePhoneAccounts();
            for (PhoneAccountHandle h : handles) {
                if (Build.VERSION.SDK_INT >= 30) {
                    if (tel.getSubscriptionId(h) == subId) ids.add(h.getId());
                } else if (h.getId() != null && (h.getId().equals(String.valueOf(subId)) || (iccId != null && iccId.length() > 0 && h.getId().startsWith(iccId)))) {
                    ids.add(h.getId());
                }
            }
        } catch (Exception ignored) { }
        return ids;
    }

    static PhoneAccountHandle handleFor(Context c, int subId, String iccId) {
        try {
            TelecomManager tm = c.getSystemService(TelecomManager.class);
            TelephonyManager tel = c.getSystemService(TelephonyManager.class);
            for (PhoneAccountHandle h : tm.getCallCapablePhoneAccounts()) {
                if (Build.VERSION.SDK_INT >= 30) { if (tel.getSubscriptionId(h) == subId) return h; }
                else if (h.getId() != null && (h.getId().equals(String.valueOf(subId)) || (iccId != null && iccId.length() > 0 && h.getId().startsWith(iccId)))) return h;
            }
        } catch (Exception ignored) { }
        return null;
    }

    static int activeSimCount(Context c) {
        try {
            List<SubscriptionInfo> l = SubscriptionManager.from(c).getActiveSubscriptionInfoList();
            return l == null ? 0 : l.size();
        } catch (Exception e) { return 0; }
    }

    private static String typeName(int t) {
        switch (t) {
            case CallLog.Calls.INCOMING_TYPE: return "incoming";
            case CallLog.Calls.OUTGOING_TYPE: return "outgoing";
            case CallLog.Calls.MISSED_TYPE: return "missed";
            case CallLog.Calls.REJECTED_TYPE: return "rejected";
            case CallLog.Calls.BLOCKED_TYPE: return "blocked";
            default: return "unknown";
        }
    }

    // ------------------------------------------------------------------ the copy itself
    /** Sends every new call of the chosen SIM. Returns how many were saved. Throws when sending failed (retry later). */
    static synchronized int run(Context c) throws Exception {
        SharedPreferences p = prefs(c);
        String token = p.getString("token", "");
        String base = p.getString("url", "");
        String anon = p.getString("anon", "");
        int subId = p.getInt("subId", -1);
        if (token.isEmpty() || base.isEmpty() || subId < 0) return 0;
        if (!can(c, Manifest.permission.READ_CALL_LOG)) {
            p.edit().putString("lastError", "Call history permission is off. Open the app and allow it.").apply();
            return 0;
        }
        Set<String> ids = accountIdsFor(c, subId, p.getString("iccId", ""));
        boolean singleSim = activeSimCount(c) <= 1;
        int saved = 0;

        while (true) {
            long since = p.getLong("since", System.currentTimeMillis());
            JSONArray batch = new JSONArray();
            long maxDate = since;
            int scanned = 0;
            String[] cols = { CallLog.Calls._ID, CallLog.Calls.NUMBER, CallLog.Calls.CACHED_NAME, CallLog.Calls.TYPE,
                    CallLog.Calls.DATE, CallLog.Calls.DURATION, CallLog.Calls.PHONE_ACCOUNT_ID };
            try (Cursor cur = c.getContentResolver().query(CallLog.Calls.CONTENT_URI, cols,
                    CallLog.Calls.DATE + " >= ?", new String[] { String.valueOf(since) }, CallLog.Calls.DATE + " ASC")) {
                if (cur == null) break;
                while (cur.moveToNext() && scanned < BATCH) {
                    scanned++;
                    long date = cur.getLong(4);
                    if (date > maxDate) maxDate = date;
                    String acc = cur.getString(6);
                    boolean mine = (acc != null && ids.contains(acc)) || ((acc == null || acc.isEmpty()) && singleSim);
                    if (!mine) continue;
                    JSONObject o = new JSONObject();
                    o.put("id", cur.getLong(0));
                    o.put("number", cur.getString(1) == null ? "" : cur.getString(1));
                    o.put("name", cur.getString(2) == null ? "" : cur.getString(2));
                    o.put("type", typeName(cur.getInt(3)));
                    o.put("date", date);
                    o.put("duration", cur.getLong(5));
                    batch.put(o);
                }
            }
            if (batch.length() > 0) saved += send(p, base, anon, token, batch);
            // a row at exactly "since" is read again next time; the server ignores repeats
            p.edit().putLong("since", maxDate).putLong("lastSync", System.currentTimeMillis()).putString("lastError", "").apply();
            if (scanned < BATCH || maxDate == since) break;
        }
        return saved;
    }

    private static int send(SharedPreferences p, String base, String anon, String token, JSONArray calls) throws Exception {
        JSONObject body = new JSONObject();
        body.put("p_token", token);
        body.put("p_calls", calls);
        HttpURLConnection con = (HttpURLConnection) new URL(base.replaceAll("/+$", "") + "/rest/v1/rpc/sim_ingest").openConnection();
        con.setRequestMethod("POST");
        con.setConnectTimeout(20000);
        con.setReadTimeout(30000);
        con.setDoOutput(true);
        con.setRequestProperty("Content-Type", "application/json");
        con.setRequestProperty("apikey", anon);
        con.setRequestProperty("Authorization", "Bearer " + anon);
        try (OutputStream os = con.getOutputStream()) { os.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
        int code = con.getResponseCode();
        String text = read(code >= 400 ? con.getErrorStream() : con.getInputStream());
        con.disconnect();
        if (code >= 200 && code < 300) {
            try { return Integer.parseInt(text.trim()); } catch (Exception e) { return calls.length(); }
        }
        if (text.contains("no longer connected") || text.contains("not active")) {
            // BI disconnected this phone: stop sending until a SIM is chosen again
            p.edit().putString("token", "").putString("lastError", "This phone was disconnected in BI. Choose the SIM again.").apply();
            return 0;
        }
        p.edit().putString("lastError", "Could not send calls (" + code + ").").apply();
        throw new Exception("sim_ingest " + code + ": " + text);
    }

    private static String read(InputStream in) {
        if (in == null) return "";
        try (InputStream s = in) {
            byte[] buf = new byte[4096]; StringBuilder sb = new StringBuilder(); int n;
            while ((n = s.read(buf)) > 0) sb.append(new String(buf, 0, n, StandardCharsets.UTF_8));
            return sb.toString();
        } catch (Exception e) { return ""; }
    }
}
