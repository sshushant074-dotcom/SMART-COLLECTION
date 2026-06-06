const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });

const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/smart_collection";

const ProductSchema = new mongoose.Schema({
  name: String,
  category: String,
  price: Number,
  salePrice: Number,
  sizes: { type: [String], default: [] },
  stock: Number
});
const Product = mongoose.model('Product', ProductSchema);

const BundleSchema = new mongoose.Schema({
  title: String,
  productA: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  productB: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  price: Number,
  isActive: Boolean
});
const Bundle = mongoose.model('Bundle', BundleSchema);

async function check() {
  await mongoose.connect(mongoUri);
  console.log("Connected to DB.");
  
  const products = await Product.find({});
  console.log("\nProducts count:", products.length);
  products.forEach(p => {
    console.log(`Product: "${p.name}", Category: "${p.category}", Sizes: ${JSON.stringify(p.sizes)}, Stock: ${p.stock}`);
  });

  const bundles = await Bundle.find({}).populate('productA').populate('productB');
  console.log("\nBundles count:", bundles.length);
  bundles.forEach(b => {
    console.log(`Bundle: "${b.title}", Active: ${b.isActive}`);
    console.log(`  Product A: "${b.productA ? b.productA.name : 'NULL'}", Sizes: ${b.productA ? JSON.stringify(b.productA.sizes) : 'N/A'}`);
    console.log(`  Product B: "${b.productB ? b.productB.name : 'NULL'}", Sizes: ${b.productB ? JSON.stringify(b.productB.sizes) : 'N/A'}`);
  });
  
  await mongoose.disconnect();
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
