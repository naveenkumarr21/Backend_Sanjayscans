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
        console.log('Executing database query...');
        const query = `
            INSERT INTO bookings (name, phone, address, test_type)
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `;
        const values = [name, phone, address, testType];

        const result = await pool.query(query, values);
        console.log('Database query success:', result.rows[0]);

        // Send SMS notifications
        const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY;
        const ADMIN_PHONE = process.env.ADMIN_PHONE;

        if (!FAST2SMS_API_KEY || !ADMIN_PHONE) {
            console.error('Configuration error: Fast2SMS API key or admin phone number missing');
            return res.status(500).json({ message: 'Server configuration error' });
        }

        // Validate admin phone number
        if (!/^[0-9]{10}$/.test(ADMIN_PHONE)) {
            console.error('Configuration error: Invalid admin phone number');
            return res.status(500).json({ message: 'Invalid admin phone number in server configuration' });
        }

        // Prepare SMS messages
        const adminMessage = `New Booking: ${name} booked a ${testType}. Contact: ${phone}, Address: ${address}`;
        const userMessage = `Dear ${name}, your ${testType} booking is confirmed. We'll contact you soon. - Sanjay Scans`;

        // Send SMS to admin
        console.log('Sending SMS to admin:', ADMIN_PHONE);
        try {
            const adminResponse = await axios.post(
                'https://www.fast2sms.com/dev/bulkV2',
                {
                    route: 'q',
                    sender_id: 'FSTSMS',
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
            console.log('Admin SMS response:', adminResponse.data);
        } catch (adminError) {
            console.error('Admin SMS error:', {
                message: adminError.message,
                response: adminError.response ? adminError.response.data : null,
            });
            throw adminError; // Re-throw to trigger catch block
        }

        // Send SMS to user
        console.log('Sending SMS to user:', phone);
        try {
            const userResponse = await axios.post(
                'https://www.fast2sms.com/dev/bulkV2',
                {
                    route: 'q',
                    sender_id: 'FSTSMS',
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
            console.log('User SMS response:', userResponse.data);
        } catch (userError) {
            console.error('User SMS error:', {
                message: userError.message,
                response: userError.response ? userError.response.data : null,
            });
            throw userError; // Re-throw to trigger catch block
        }

        res.status(201).json({
            message: 'Booking created successfully, SMS notifications sent',
            booking: result.rows[0],
        });
    } catch (error) {
        console.error('Error processing booking:', {
            message: error.message,
            stack: error.stack,
            response: error.response ? error.response.data : null,
        });
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