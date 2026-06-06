const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart_collection';

const OrderSchema = new mongoose.Schema({
  orderId: String,
  customerPhone: String,
  customerEmail: String,
  customerName: String,
  status: String,
  subtotal: Number,
  date: String
});
const Order = mongoose.model('Order', OrderSchema);

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');
  const order = await Order.findOne({ orderId: 'SC-613768' });
  if (order) {
    console.log(JSON.stringify(order, null, 2));
  } else {
    console.log('Order not found');
  }
  process.exit(0);
}
run().catch(err => {
  console.error(err);
  process.exit(1);
});
