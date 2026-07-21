const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://vrzepdjjjpodztqkfsbh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZyemVwZGpqanBvZHp0cWtmc2JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MjE0OTUsImV4cCI6MjA5ODA5NzQ5NX0.4I8jKyYwDt0i_pIHmrCTCCKExs7Of4w1B60ClImzxCc';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    // sign up a dummy user
    const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: `test_${Date.now()}@example.com`,
        password: 'password123'
    });
    
    if (authErr) {
        console.error("Auth error:", authErr);
        // continue anyway to see if we can read
    }

    const { data: memberships, error: memErr } = await supabase.from('memberships').select('*');
    console.log("Memberships:", memberships);
    console.log("Error:", memErr);
}

test();
