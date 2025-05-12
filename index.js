const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
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

// API endpoint to handle booking form submission
app.post('/api/book-test', async (req, res) => {
    console.log('Received request:', req.body);
    const { name, phone, address, testType } = req.body;

    // Basic validation
    if (!name || !phone || !address || !testType) {
        console.log('Validation failed: Missing fields');
        return res.status(400).json({ message: 'All fields are required' });
    }

    try {
        console.log('Executing query...');
        const query = `
            INSERT INTO bookings (name, phone, address, test_type)
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `;
        const values = [name, phone, address, testType];

        const result = await pool.query(query, values);
        console.log('Query success:', result.rows[0]);
        res.status(201).json({ message: 'Booking created successfully', booking: result.rows[0] });
    } catch (error) {
        console.error('Error inserting booking:', error.stack);
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