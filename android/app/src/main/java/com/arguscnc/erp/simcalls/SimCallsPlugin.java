package com.arguscnc.erp.simcalls;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.telecom.PhoneAccountHandle;
import android.telecom.TelecomManager;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.List;

/**
 * SIM Calls (window.Capacitor.Plugins.SimCalls): lists the SIMs in the phone, remembers the company SIM the person
 * chose, places calls through it and copies its call history to BI (see SimCallSync).
 */
@CapacitorPlugin(
    name = "SimCalls",
    permissions = {
        @Permission(alias = "phone", strings = { Manifest.permission.READ_PHONE_STATE, Manifest.permission.READ_CALL_LOG, Manifest.permission.CALL_PHONE }),
        @Permission(alias = "numbers", strings = { Manifest.permission.READ_PHONE_NUMBERS }),
        // call recordings saved by the phone's own dialer (Android 13+ / older)
        @Permission(alias = "audio", strings = { Manifest.permission.READ_MEDIA_AUDIO }),
        @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE })
    }
)
public class SimCallsPlugin extends Plugin {

    private Context ctx() { return getContext().getApplicationContext(); }

    private boolean phoneGranted() { return getPermissionState("phone") == PermissionState.GRANTED; }

    @PluginMethod
    public void status(PluginCall call) {
        SharedPreferences p = SimCallSync.prefs(ctx());
        JSObject r = new JSObject();
        r.put("supported", true);
        r.put("granted", phoneGranted());
        r.put("deviceId", deviceId());
        r.put("deviceModel", Build.MANUFACTURER + " " + Build.MODEL);
        boolean connected = SimCallSync.isConnected(ctx());
        r.put("connected", connected);
        if (p.getInt("subId", -1) >= 0) {
            JSObject s = new JSObject();
            s.put("subscriptionId", p.getInt("subId", -1));
            s.put("slot", p.getInt("slot", 0));
            s.put("carrier", p.getString("carrier", ""));
            s.put("label", p.getString("label", ""));
            s.put("number", p.getString("number", ""));
            s.put("lineId", p.getString("lineId", ""));
            r.put("sim", s);
        }
        r.put("lastSync", p.getLong("lastSync", 0));
        r.put("lastError", p.getString("lastError", ""));
        r.put("recordingsAllowed", SimCallRecordings.canRead(ctx()));
        r.put("recordingsWaiting", SimCallRecordings.pendingCount(p));
        r.put("lastRecordingAt", p.getLong("lastRecAt", 0));
        r.put("lastRecordingError", p.getString("lastRecError", ""));
        call.resolve(r);
    }

    private String audioAlias() { return Build.VERSION.SDK_INT >= 33 ? "audio" : "storage"; }

    /** Allow reading the call recordings the phone's dialer saves. */
    @PluginMethod
    public void requestRecordings(PluginCall call) {
        if (SimCallRecordings.canRead(ctx())) { recordingsDone(call); return; }
        requestPermissionForAlias(audioAlias(), call, "recordingsDone");
    }

    @PermissionCallback
    private void recordingsDone(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", SimCallRecordings.canRead(ctx()));
        if (SimCallRecordings.canRead(ctx())) SimCallSync.soon(ctx(), 1);
        call.resolve(r);
    }

    /** The BI server address (recordings are uploaded through it). Set on every app start. */
    @PluginMethod
    public void configure(PluginCall call) {
        String api = call.getString("api", "");
        if (!api.isEmpty()) SimCallSync.prefs(ctx()).edit().putString("api", api.replaceAll("/+$", "")).apply();
        call.resolve();
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        if (phoneGranted()) { askNumbers(call); return; }
        requestPermissionForAlias("phone", call, "phoneDone");
    }

    @PermissionCallback
    private void phoneDone(PluginCall call) {
        if (!phoneGranted()) { JSObject r = new JSObject(); r.put("granted", false); call.resolve(r); return; }
        askNumbers(call);
    }

    private void askNumbers(PluginCall call) {
        // the SIM's own number (Android 8+): nice to have, so a "no" here does not matter
        if (Build.VERSION.SDK_INT >= 26 && getPermissionState("numbers") != PermissionState.GRANTED) {
            requestPermissionForAlias("numbers", call, "numbersDone");
            return;
        }
        numbersDone(call);
    }

    @PermissionCallback
    private void numbersDone(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", phoneGranted());
        call.resolve(r);
    }

    @PluginMethod
    public void listSims(PluginCall call) {
        if (!phoneGranted()) { call.reject("Allow phone access first.", "NO_PERMISSION"); return; }
        JSArray out = new JSArray();
        try {
            SubscriptionManager sm = SubscriptionManager.from(ctx());
            List<SubscriptionInfo> subs = sm.getActiveSubscriptionInfoList();
            if (subs != null) {
                for (SubscriptionInfo s : subs) {
                    JSObject o = new JSObject();
                    o.put("subscriptionId", s.getSubscriptionId());
                    o.put("slot", s.getSimSlotIndex() + 1);
                    o.put("carrier", s.getCarrierName() == null ? "" : s.getCarrierName().toString());
                    o.put("label", s.getDisplayName() == null ? "" : s.getDisplayName().toString());
                    o.put("number", numberOf(sm, s));
                    o.put("country", s.getCountryIso() == null ? "" : s.getCountryIso());
                    out.put(o);
                }
            }
        } catch (SecurityException e) {
            call.reject("Allow phone access first.", "NO_PERMISSION"); return;
        } catch (Exception e) {
            call.reject("Could not read the SIMs: " + e.getMessage()); return;
        }
        JSObject r = new JSObject();
        r.put("sims", out);
        call.resolve(r);
    }

    @SuppressWarnings("deprecation")
    private String numberOf(SubscriptionManager sm, SubscriptionInfo s) {
        try {
            String n = Build.VERSION.SDK_INT >= 33 ? sm.getPhoneNumber(s.getSubscriptionId()) : s.getNumber();
            return n == null ? "" : n;
        } catch (Exception e) { return ""; }
    }

    /** Remember the chosen SIM and its key from BI, then start sending its calls. */
    @PluginMethod
    public void connect(PluginCall call) {
        Integer subId = call.getInt("subscriptionId");
        String token = call.getString("token", "");
        String url = call.getString("url", "");
        String anon = call.getString("anon", "");
        if (subId == null || token.isEmpty() || url.isEmpty() || anon.isEmpty()) { call.reject("Missing SIM details."); return; }
        String iccId = "";
        try {
            SubscriptionInfo s = SubscriptionManager.from(ctx()).getActiveSubscriptionInfo(subId);
            if (s != null && Build.VERSION.SDK_INT < 29 && s.getIccId() != null) iccId = s.getIccId();
        } catch (Exception ignored) { }
        SimCallSync.prefs(ctx()).edit()
            .putInt("subId", subId)
            .putInt("slot", call.getInt("slot", 0))
            .putString("carrier", call.getString("carrier", ""))
            .putString("label", call.getString("label", ""))
            .putString("number", call.getString("number", ""))
            .putString("lineId", call.getString("lineId", ""))
            .putString("iccId", iccId)
            .putString("token", token)
            .putString("url", url)
            .putString("anon", anon)
            .putString("api", call.getString("api", "").replaceAll("/+$", ""))
            .putString("recPending", "[]")
            // calls from this moment on (a few minutes back, so a call made while setting up is included)
            .putLong("since", System.currentTimeMillis() - 10 * 60 * 1000L)
            .putLong("lastSync", 0)
            .putString("lastError", "")
            .apply();
        SimCallSync.schedule(ctx());
        SimCallSync.soon(ctx(), 1);
        call.resolve();
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        SimCallSync.cancel(ctx());
        SimCallSync.prefs(ctx()).edit().clear().apply();
        call.resolve();
    }

    /** Send new calls now (used when the app opens and from the "Send now" button). */
    @PluginMethod
    public void syncNow(PluginCall call) {
        if (!SimCallSync.isConnected(ctx())) { JSObject r = new JSObject(); r.put("sent", 0); call.resolve(r); return; }
        SimCallSync.schedule(ctx());   // make sure the 15-minute job exists (it survives restarts by itself)
        new Thread(() -> {
            JSObject r = new JSObject();
            try { r.put("sent", SimCallSync.run(ctx())); }
            catch (Exception e) { r.put("sent", 0); r.put("error", SimCallSync.prefs(ctx()).getString("lastError", "Could not send calls.")); }
            call.resolve(r);
        }).start();
    }

    /** Call a number through the company SIM. */
    @PluginMethod
    public void dial(PluginCall call) {
        String number = call.getString("number", "").trim();
        if (number.isEmpty()) { call.reject("Enter a number."); return; }
        SharedPreferences p = SimCallSync.prefs(ctx());
        Uri uri = Uri.fromParts("tel", number, null);
        try {
            if (SimCallSync.can(ctx(), Manifest.permission.CALL_PHONE)) {
                TelecomManager tm = ctx().getSystemService(TelecomManager.class);
                Bundle extras = new Bundle();
                PhoneAccountHandle h = SimCallSync.handleFor(ctx(), p.getInt("subId", -1), p.getString("iccId", ""));
                if (h != null) extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, h);
                tm.placeCall(uri, extras);
            } else {
                Intent i = new Intent(Intent.ACTION_DIAL, uri);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(i);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not start the call: " + e.getMessage());
        }
    }

    private String deviceId() {
        String id = Settings.Secure.getString(ctx().getContentResolver(), Settings.Secure.ANDROID_ID);
        return id == null ? "" : id;
    }
}
