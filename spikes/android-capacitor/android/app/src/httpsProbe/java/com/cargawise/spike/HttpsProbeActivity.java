package com.cargawise.spike;

import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/** Technical harness included only by -PcwHttpsProbe=true in the debug source set. */
public class HttpsProbeActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() != null) {
            getBridge().getWebView().loadUrl("https://localhost/f0-https.html?api="
                + Build.VERSION.SDK_INT + "&model=" + Uri.encode(Build.MODEL));
        }
    }
}
