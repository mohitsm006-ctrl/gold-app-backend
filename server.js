require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');
const axios = require('axios'); // For calling GoldAPI.io

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory data store for simplicity (as requested)
let alerts = [];
let priceHistory = [];

// Initialize history with some mock data for the chart
let currentGoldPrice = 7300; // Starting simulated price (1 gram)
for(let i=10; i>=0; i--) {
    const time = new Date(Date.now() - i * 60000);
    const timeString = time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    priceHistory.push({
        time: timeString,
        price: currentGoldPrice + Math.floor(Math.random() * 40 - 20) // Random variance (-20 to +20)
    });
}
// Set current to the last history item
currentGoldPrice = priceHistory[priceHistory.length - 1].price;

// Nodemailer Transporter Setup
// IMPORTANT: Set these variables in a .env file
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'your-email@gmail.com', // Your Gmail address
        pass: process.env.EMAIL_PASS || 'your-app-password'     // Your Gmail App Password
    }
});

/**
 * Route: Get Price History
 * Returns the array of timestamps and prices for the chart
 */
app.get('/api/history', (req, res) => {
    res.json(priceHistory);
});

/**
 * Route: Save Alert
 * Accepts email and targetPrice
 */
app.post('/save', (req, res) => {
    const { email, targetPrice } = req.body;

    if (!email || !targetPrice) {
        return res.status(400).json({ error: 'Email and target price are required.' });
    }

    // Add alert to memory
    alerts.push({ email, targetPrice, active: true });
    
    // Send welcome email
    sendWelcomeEmail(email, targetPrice);

    // Check immediately in case price is already below target
    checkPriceDrop();

    res.status(201).json({ message: 'Alert saved successfully!' });
});

/**
 * Core Function: Fetch Real Price and Check Alerts
 * Uses MetalpriceAPI. If API key is missing, falls back to simulation.
 */
async function fetchRealGoldPrice() {
    if (!process.env.METALPRICE_API_KEY) {
        // Fallback to simulation
        const change = Math.floor(Math.random() * 30) - 15;
        currentGoldPrice += change;
        const now = new Date();
        const timeString = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        priceHistory.push({ time: timeString, price: currentGoldPrice });
        if (priceHistory.length > 30) priceHistory.shift();
        
        console.log(`[${timeString}] Simulated Gold Price: ₹${currentGoldPrice}`);
        checkPriceDrop();
        return;
    }

    try {
        const url = `https://api.metalpriceapi.com/v1/latest?api_key=${process.env.METALPRICE_API_KEY}&base=XAU&currencies=INR`;
        const response = await axios.get(url);

        if (response.data && response.data.success && response.data.rates && response.data.rates.INR) {
            const pricePerOunce = response.data.rates.INR;
            // Convert Ounce to 1 Gram (1 Troy Ounce = 31.1034768 grams)
            currentGoldPrice = Math.round(pricePerOunce / 31.1034768);
            
            const now = new Date();
            const timeString = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            priceHistory.push({ time: timeString, price: currentGoldPrice });
            if (priceHistory.length > 30) priceHistory.shift();

            console.log(`[${timeString}] Real Gold Price (MetalpriceAPI): ₹${currentGoldPrice}`);
            checkPriceDrop();
        }
    } catch (error) {
        console.error("MetalpriceAPI Error:", error.response ? error.response.data : error.message);
    }
}

/**
 * Check active alerts against current price
 */
function checkPriceDrop() {
    alerts.forEach((alert, index) => {
        if (alert.active && currentGoldPrice <= alert.targetPrice) {
            sendEmailNotification(alert.email, currentGoldPrice, alert.targetPrice);
            // Mark as inactive after sending to prevent spamming
            alert.active = false;
        }
    });

    // Optionally cleanup inactive alerts
    alerts = alerts.filter(a => a.active);
}

/**
 * Function: Send Welcome Email
 */
function sendWelcomeEmail(userEmail, targetPrice) {
    const mailOptions = {
        from: process.env.EMAIL_USER || 'your-email@gmail.com',
        to: userEmail,
        subject: 'Welcome to Gold Price Alerts!',
        html: `
            <h2>Welcome!</h2>
            <p>You will be notified once the price has dropped below your target of ₹${targetPrice}...</p>
        `
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending welcome email to ' + userEmail + ':', error.message);
        } else {
            console.log('Welcome email sent successfully to ' + userEmail + ':', info.response);
        }
    });
}

/**
 * Function: Send Email Notification
 */
function sendEmailNotification(userEmail, currentPrice, targetPrice) {
    const mailOptions = {
        from: process.env.EMAIL_USER || 'your-email@gmail.com',
        to: userEmail,
        subject: 'Gold Price Alert',
        html: `
            <h2>Gold price dropped below your target!</h2>
            <ul>
                <li><strong>Your Target Price:</strong> ₹${targetPrice}</li>
                <li><strong>Current Price:</strong> ₹${currentPrice}</li>
            </ul>
        `
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending email to ' + userEmail + ':', error.message);
            console.log('NOTE: Please configure EMAIL_USER and EMAIL_PASS in .env file to enable actual emails.');
        } else {
            console.log('Email sent successfully to ' + userEmail + ':', info.response);
        }
    });
}

// Fetch immediately on startup
fetchRealGoldPrice();

// Start price check interval (every 10 minutes to save API requests)
// MetalpriceAPI limits may vary. Adjust as needed!
setInterval(fetchRealGoldPrice, 10 * 60000);

// Start Server
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server is running beautifully on http://localhost:${PORT}`);
    });
}

// Export for Vercel
module.exports = app;
