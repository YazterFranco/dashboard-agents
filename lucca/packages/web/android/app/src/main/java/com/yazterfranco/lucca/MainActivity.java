package com.yazterfranco.lucca;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin propio: recibir el PDF de la agenda compartido desde otra app.
        registerPlugin(SharedPdfPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
