package com.arguscnc.erp;

import android.os.Bundle;

import com.arguscnc.erp.simcalls.SimCallsPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // the app's own plugins (must be registered before the web view starts)
        registerPlugin(SimCallsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
