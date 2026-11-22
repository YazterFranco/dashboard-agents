package com.yazterfranco.lucca;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * Recibe el PDF de la agenda cuando papá lo abre o lo comparte con Lucca desde otra app
 * (Descargas, Chrome, el gestor de archivos). La web lo pide con takePendingPdf() y lo importa.
 */
@CapacitorPlugin(name = "SharedPdf")
public class SharedPdfPlugin extends Plugin {
    /** El mismo límite que el servidor: una agenda de Mereb pesa unos cientos de KB. */
    static final int MAX_BYTES = 5 * 1024 * 1024;

    private Uri pending = null;

    @Override
    public void load() {
        remember(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (remember(intent)) notifyListeners("pdf", new JSObject(), true);
    }

    /** Guarda la dirección del PDF que trae el aviso de Android (VIEW o SEND). */
    private boolean remember(Intent intent) {
        Uri uri = SharedPdfIntent.pdfUri(intent);
        if (uri == null) return false;
        pending = uri;
        // Se marca como atendido: al girar la pantalla no se vuelve a importar.
        intent.setAction(Intent.ACTION_MAIN);
        return true;
    }

    @PluginMethod
    public void takePendingPdf(PluginCall call) {
        Uri uri = pending;
        pending = null;
        JSObject out = new JSObject();
        if (uri == null) {
            call.resolve(out);
            return;
        }
        ContentResolver resolver = getContext().getContentResolver();
        try (InputStream in = resolver.openInputStream(uri)) {
            if (in == null) throw new IllegalStateException("sin contenido");
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[64 * 1024];
            int read;
            while ((read = in.read(chunk)) != -1) {
                buffer.write(chunk, 0, read);
                if (buffer.size() > MAX_BYTES) {
                    out.put("error", "too-large");
                    call.resolve(out);
                    return;
                }
            }
            out.put("name", displayName(resolver, uri));
            out.put("base64", Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP));
            call.resolve(out);
        } catch (Exception e) {
            out.put("error", "unreadable");
            call.resolve(out);
        }
    }

    private static String displayName(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                if (name != null && !name.isEmpty()) return name;
            }
        } catch (Exception ignored) {
            // Sin nombre: se usa uno genérico.
        }
        return "agenda.pdf";
    }
}
