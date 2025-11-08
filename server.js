const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const youtubeChannelRoutes = require('./routes/routes');
const bannerRoutes = require('./routes/bannerRoutes');
const adminRoutes = require('./controllers/admin/admin');

const app = express();
connectDB();

app.use(cors());
app.use(express.json());

app.use('/api', youtubeChannelRoutes);
app.use('/api', bannerRoutes);
app.use('/api', adminRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
