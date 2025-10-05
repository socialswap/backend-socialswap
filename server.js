const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const youtubeChannelRoutes = require('./routes/routes');

const app = express();
connectDB();

app.use(cors());
app.use(express.json());

app.use('/api', youtubeChannelRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
