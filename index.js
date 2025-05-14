const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors()); // Allow all origins for testing
app.use(express.json());

// PostgreSQL connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Required for Neon
});

// Test database connection
pool.connect((err) => {
    if (err) {
        console.error('Database connection error:', err.stack);
    } else {
        console.log('Connected to PostgreSQL database');
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'Backend is running' });
});

// API endpoint to handle booking form submission and send SMS
app.post('/api/book-test', async (req, res) => {
    console.log('Received request:', req.body);
    const { name, phone, address, testType } = req.body;

    // Basic validation
    if (!name || !phone || !address || !testType) {
        console.log('Validation failed: Missing fields');
        return res.status(400).json({ message: 'All fields are required' });
    }

    // Validate phone number (10-digit Indian number)
    if (!/^[0-9]{10}$/.test(phone)) {
        console.log('Validation failed: Invalid phone number');
        return res.status(400).json({ message: 'Invalid phone number. Please provide a 10-digit number' });
    }

    try {
        // Insert booking into database
        console.log('Executing query...');
        const query = `
            INSERT INTO bookings (name, phone, address, test_type)
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `;
        const values = [name, phone, address, testType];

        const result = await pool.query(query, values);
        console.log('Query success:', result.rows[0]);

        // Send SMS notifications
        const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY;
        const ADMIN_PHONE = process.env.ADMIN_PHONE; // e.g., '9876543210'

        if (!FAST2SMS_API_KEY || !ADMIN_PHONE) {
            console.error('Fast2SMS API key or admin phone number missing');
            return res.status(500).json({ message: 'Server configuration error' });
        }

        // Prepare SMS messages
        const adminMessage = `New Booking: ${name} booked a ${testType}. Contact: ${phone}, Address: ${address}`;
        const userMessage = `Dear ${name}, your ${testType} booking is confirmed. We'll contact you soon. - Sanjay Scans`;

        // Send SMS to admin
        await axios.post(
            'https://www.fast2sms.com/dev/bulkV2',
            {
                route: 'q', // Quick SMS route
                sender_id: 'FSTSMS', // Default sender ID
                message: adminMessage,
                language: 'english',
                numbers: ADMIN_PHONE,
            },
            {
                headers: {
                    authorization: FAST2SMS_API_KEY,
                    'Content-Type': 'application/json',
                },
            }
        );

        // Send SMS to user
        await axios.post(
            'https://www.fast2sms.com/dev/bulkV2',
            {
                route: 'q', // Quick SMS route
                sender_id: 'FSTSMS', // Default sender ID
                message: userMessage,
                language: 'english',
                numbers: phone,
            },
            {
                headers: {
                    authorization: FAST2SMS_API_KEY,
                    'Content-Type': 'application/json',
                },
            }
        );

        res.status(201).json({
            message: 'Booking created successfully, SMS notifications sent',
            booking: result.rows[0],
        });
    } catch (error) {
        console.error('Error processing booking:', error.stack);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down server...');
    await pool.end();
    process.exit(0);
});