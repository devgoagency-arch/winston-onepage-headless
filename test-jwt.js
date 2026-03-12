
import fs from 'fs';
import path from 'path';

const envPath = path.resolve('.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        env[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
});

const WP_URL = env.WP_URL || 'https://tienda.winstonandharrystore.com';

async function testJWT() {
    console.log("Testing JWT endpoint at:", `${WP_URL}/wp-json/jwt-auth/v1/token`);
    
    // We don't have a real user password here to test full login, 
    // but we can check if the endpoint exists by sending an empty request
    try {
        const res = await fetch(`${WP_URL}/wp-json/jwt-auth/v1/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'test', password: 'test-password' })
        });
        
        const data = await res.json();
        console.log("Response Status:", res.status);
        console.log("Response Data:", data);
        
        if (data.code === 'jwt_auth_invalid_username' || data.code === 'jwt_auth_failed' || data.code === 'jwt_auth_invalid_credentials') {
            console.log("✅ Plugin is active! (Received expected auth error)");
        } else if (res.status === 404) {
            console.log("❌ Plugin NOT found (404). Check if it's activated.");
        } else {
            console.log("Unexpected response. Check plugin settings.");
        }
    } catch (e) {
        console.error("Error connecting to JWT endpoint:", e.message);
    }
}

testJWT();
