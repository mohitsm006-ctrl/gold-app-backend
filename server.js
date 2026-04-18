require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Supabase Initialization
const supabaseUrl = process.env.SUPABASE_URL || 'https://xyz.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'your-supabase-key';
const supabase = createClient(supabaseUrl, supabaseKey);

// Nodemailer Transporter Setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'your-email@gmail.com',
        pass: process.env.EMAIL_PASS || 'your-app-password'
    }
});

/**
 * Route: Get Price History
 * Fetches the last 30 entries from Supabase to show on the chart
 */
app.get('/api/history', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('price_history')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(30);

        if (error) throw error;
        
        // Reverse to show oldest to newest on chart
        res.json(data.reverse());
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

/**
 * Route: Save Alert
 * Saves alert to Supabase and immediately checks if we should notify
 */
app.post('/save', async (req, res) => {
    const { email, targetPrice } = req.body;

    if (!email || !targetPrice) {
        return res.status(400).json({ error: 'Email and target price are required.' });
    }

    try {
        // 1. Insert alert into Supabase
        const { error } = await supabase
            .from('alerts')
            .insert([{ email, target_price: targetPrice, active: true }]);

        if (error) throw error;

        // 2. Send Welcome Email
        sendWelcomeEmail(email, targetPrice);

        // 3. Immediately check if current price is already below target
        const { data: latestHistory } = await supabase
            .from('price_history')
            .select('price')
            .order('created_at', { ascending: false })
            .limit(1);

        if (latestHistory && latestHistory.length > 0) {
            const currentPrice = latestHistory[0].price;
            if (currentPrice <= targetPrice) {
                sendEmailNotification(email, currentPrice, targetPrice);
                // Mark alert as inactive
                await supabase
                    .from('alerts')
                    .update({ active: false })
                    .eq('email', email)
                    .eq('target_price', targetPrice);
            }
        }

        res.status(201).json({ message: 'Alert saved to database successfully!' });
    } catch (error) {
        console.error('Error saving alert:', error);
        res.status(500).json({ error: 'Failed to save alert.' });
    }
});

/**
 * Route: Cron Job Endpoint for Vercel
 * Vercel will trigger this periodically to fetch price and check alerts
 */
app.get('/api/cron', async (req, res) => {
    console.log('CRON job triggered!');
    await fetchRealGoldPriceAndCheckAlerts();
    res.status(200).json({ message: 'Price checked successfully.' });
});

/**
 * Core Function: Fetch Real Price and Check Alerts
 */
async function fetchRealGoldPriceAndCheckAlerts() {
    let newPrice = null;

    if (!process.env.METALPRICE_API_KEY) {
        // Fallback simulation mode
        console.log("No API Key: Running simulated gold price.");
        
        // Get last price to simulate realistically
        const { data: lastRecord } = await supabase
            .from('price_history')
            .select('price')
            .order('created_at', { ascending: false })
            .limit(1);
            
        let basePrice = lastRecord && lastRecord.length > 0 ? lastRecord[0].price : 7300;
        newPrice = basePrice + Math.floor(Math.random() * 30) - 15;
    } else {
        // Real API Mode
        try {
            const url = `https://api.metalpriceapi.com/v1/latest?api_key=${process.env.METALPRICE_API_KEY}&base=XAU&currencies=INR`;
            const response = await axios.get(url);
    
            if (response.data && response.data.rates && response.data.rates.INR) {
                const pricePerOunce = response.data.rates.INR;
                newPrice = Math.round(pricePerOunce / 31.1034768); // Convert Ounce to Gram
            }
        } catch (error) {
            console.error("MetalpriceAPI Error:", error.message);
            return;
        }
    }

    if (!newPrice) return;

    // 1. Save new price to Database
    const now = new Date();
    const timeString = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    await supabase.from('price_history').insert([{ 
        time: timeString, 
        price: newPrice 
    }]);

    console.log(`[${timeString}] Recorded Gold Price: ₹${newPrice}`);

    // 2. Check active alerts
    const { data: activeAlerts, error } = await supabase
        .from('alerts')
        .select('*')
        .eq('active', true);

    if (!error && activeAlerts) {
        for (const alert of activeAlerts) {
            if (newPrice <= alert.target_price) {
                sendEmailNotification(alert.email, newPrice, alert.target_price);
                
                // Mark alert as inactive
                await supabase
                    .from('alerts')
                    .update({ active: false })
                    .eq('id', alert.id);
            }
        }
    }
}

/**
 * Functions: Send Emails
 */
function sendWelcomeEmail(userEmail, targetPrice) {
    const mailOptions = {
        from: process.env.EMAIL_USER || 'your-email@gmail.com',
        to: userEmail,
        subject: 'Welcome to Gold Price Alerts!',
        html: `<h2>Welcome!</h2><p>You will be notified once the price has dropped below your target of ₹${targetPrice}...</p>`
    };
    transporter.sendMail(mailOptions, (error) => {
        if (error) console.error('Error sending welcome email to ' + userEmail + ':', error.message);
    });
}

function sendEmailNotification(userEmail, currentPrice, targetPrice) {
    const mailOptions = {
        from: process.env.EMAIL_USER || 'your-email@gmail.com',
        to: userEmail,
        subject: 'Gold Price Alert',
        html: `<h2>Gold price dropped below your target!</h2><ul><li><strong>Your Target Price:</strong> ₹${targetPrice}</li><li><strong>Current Price:</strong> ₹${currentPrice}</li></ul>`
    };
    transporter.sendMail(mailOptions, (error) => {
        if (error) console.error('Error sending alert to ' + userEmail + ':', error.message);
    });
}

// Local polling for development purposes if running locally
if (process.env.NODE_ENV !== 'production') {
    // Run once on start
    fetchRealGoldPriceAndCheckAlerts();
    // Then every 10 minutes locally
    setInterval(fetchRealGoldPriceAndCheckAlerts, 10 * 60000);
    
    app.listen(PORT, () => {
        console.log(`Server is running beautifully on http://localhost:${PORT}`);
    });
}

// Export for Vercel Serverless
module.exports = app;
