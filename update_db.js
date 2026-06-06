const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

// Robust connection string detection
let MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || !trimmed) continue;
      const match = trimmed.match(/(mongodb(?:\+srv)?:\/\/\S+)/);
      if (match) {
        MONGODB_URI = match[1];
        break;
      }
    }
  }
}

if (!MONGODB_URI) {
  MONGODB_URI = 'mongodb://localhost:27017/smart_collection';
}

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  price: { type: Number, required: true },
  salePrice: { type: Number, default: null },
  image: { type: String, required: true },
  stock: { type: Number, required: true },
  available: { type: Boolean, default: true },
  desc: { type: String, required: true },
  sizes: { type: [String], default: [] }
});
const Product = mongoose.model('Product', ProductSchema);

async function run() {
  try {
    console.log("Connecting to database at:", MONGODB_URI);
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
    console.log("Connected successfully.");
  } catch (err) {
    console.warn("First connection failed, falling back to local MongoDB...");
    try {
      MONGODB_URI = 'mongodb://localhost:27017/smart_collection';
      console.log("Connecting to database at:", MONGODB_URI);
      await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
      console.log("Connected successfully to local MongoDB.");
    } catch (localErr) {
      console.error("Migration failed on both connection strings:", localErr.message);
      process.exit(1);
    }
  }

  try {
    // Delete existing products
    const delResult = await Product.deleteMany({});
    console.log(`Deleted ${delResult.deletedCount} old products.`);

    // Add new ones with isolated images
    const seedProducts = [
      {
        name: "Kids Playful Dungaree Set",
        category: "children",
        price: 499,
        image: "images/kids_dungaree.png",
        stock: 12,
        available: true,
        desc: "A highly comfortable and durable dungaree set made from premium cotton. Perfect for active kids aged 2 to 6 years.",
        sizes: ["2-3Y", "4-5Y", "5-6Y"]
      },
      {
        name: "Toddler Cozy Cotton Co-ord",
        category: "children",
        price: 599,
        image: "images/kids_coord.png",
        stock: 8,
        available: true,
        desc: "An ultra-soft clothing set for toddlers. Hypoallergenic fabric ensures zero skin irritation. Ideal for casual indoor/outdoor play.",
        sizes: ["2-3Y", "4-5Y", "5-6Y"]
      },
      {
        name: "Girls Enchanted Floral Gown",
        category: "girls",
        price: 1299,
        image: "images/girls_gown.png",
        stock: 5,
        available: true,
        desc: "A stunning ready-made floral gown for girls, styled with premium lace and silk lining. Made for festive wear, birthdays, and wedding parties.",
        sizes: ["S", "M", "L", "XL"]
      },
      {
        name: "Girls Modern Summer Frock",
        category: "girls",
        price: 799,
        image: "images/girls_frock.png",
        stock: 15,
        available: true,
        desc: "Breathable, lightweight cotton frock featuring pretty summer colors. Comes with an adjustable waist tie. Fit for daily casual outings.",
        sizes: ["S", "M", "L", "XL"]
      },
      {
        name: "Men's Premium Linen Shirt",
        category: "men",
        price: 999,
        salePrice: 799,
        image: "images/men_shirt.png",
        stock: 10,
        available: true,
        desc: "Stay cool and sharp with this premium pure-linen shirt. Featuring a modern cut, classic spread collar, and breathable weave.",
        sizes: ["S", "M", "L", "XL", "XXL"]
      },
      {
        name: "Men's Smart Casual Chinos",
        category: "men",
        price: 1499,
        image: "images/men_chinos.png",
        stock: 6,
        available: true,
        desc: "Perfectly tailored stretch-cotton trousers. Seamless transition from office desk to weekend dinners. Wrinkle-resistant fabric.",
        sizes: ["S", "M", "L", "XL", "XXL"]
      }
    ];

    await Product.insertMany(seedProducts);
    console.log("Successfully seeded new isolated product images.");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  }
}
run();
