/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8YW5kcm9pZC9hcHAvc3JjL2FuZHJvaWRUZXN0L2phdmEvY29tL2dldGNhcGFjaXRvci9teWFwcC9FeGFtcGxlSW5zdHJ1bWVudGVkVGVzdC5qYXZhfDIwMjYtMDl8YjlhYmEwOGVlMg== */
package com.getcapacitor.myapp;

import static org.junit.Assert.*;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Instrumented test, which will execute on an Android device.
 *
 * @see <a href="http://d.android.com/tools/testing">Testing documentation</a>
 */
@RunWith(AndroidJUnit4.class)
public class ExampleInstrumentedTest {

    @Test
    public void useAppContext() throws Exception {
        // Context of the app under test.
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();

        assertEquals("com.getcapacitor.app", appContext.getPackageName());
    }
}
