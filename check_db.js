const mongoose = require('mongoose');
const Channel = require('./models/channel');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/socialswap', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const allChannels = await Channel.find({}, 'name status sold');
  console.log('Channels in DB:', allChannels.length);
  
  const statusCounts = {};
  for (const c of allChannels) {
    statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
  }
  
  console.log('Status counts:', statusCounts);
  
  // Fix 'unsold' to 'Available'
  const res = await Channel.updateMany({ status: 'unsold' }, { $set: { status: 'Available' } });
  console.log('Updated unsold to Available:', res);
  
  mongoose.disconnect();
}

run().catch(console.error);
