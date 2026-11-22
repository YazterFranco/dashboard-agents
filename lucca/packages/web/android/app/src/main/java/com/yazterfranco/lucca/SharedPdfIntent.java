package com.yazterfranco.lucca;

import android.content.Intent;
import android.net.Uri;

/** Reglas puras (probadas en la JVM): qué aviso de Android trae un PDF y dónde está. */
final class SharedPdfIntent {
    private SharedPdfIntent() {}

    static boolean isPdfType(String type) {
        return type != null && type.toLowerCase().startsWith("application/pdf");
    }

    static Uri pdfUri(Intent intent) {
        if (intent == null) return null;
        String action = intent.getAction();
        if (Intent.ACTION_VIEW.equals(action) && isPdfType(intent.getType())) return intent.getData();
        if (Intent.ACTION_SEND.equals(action) && isPdfType(intent.getType())) {
            Object extra = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            return extra instanceof Uri ? (Uri) extra : null;
        }
        return null;
    }
}
