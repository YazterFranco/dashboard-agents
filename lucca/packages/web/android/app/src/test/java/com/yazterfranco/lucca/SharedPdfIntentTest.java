package com.yazterfranco.lucca;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class SharedPdfIntentTest {
    @Test
    public void reconoceElTipoPdf() {
        assertTrue(SharedPdfIntent.isPdfType("application/pdf"));
        assertTrue(SharedPdfIntent.isPdfType("APPLICATION/PDF"));
        assertTrue(SharedPdfIntent.isPdfType("application/pdf; charset=binary"));
    }

    @Test
    public void rechazaOtrosTipos() {
        assertFalse(SharedPdfIntent.isPdfType(null));
        assertFalse(SharedPdfIntent.isPdfType("image/png"));
        assertFalse(SharedPdfIntent.isPdfType("text/plain"));
        assertFalse(SharedPdfIntent.isPdfType(""));
    }

    @Test
    public void elLimiteEsElMismoQueElDelServidor() {
        assertEquals(5 * 1024 * 1024, SharedPdfPlugin.MAX_BYTES);
    }
}
