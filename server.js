require('dotenv').config();
const dns = require('dns');
const mongoUri = process.env.MONGODB_URL || process.env.MONGODB_URI;
if (mongoUri && mongoUri.startsWith('mongodb+srv')) {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
    dns.setDefaultResultOrder('ipv4first');
  } catch (err) {
    console.warn('⚠️ Failed to set custom DNS servers:', err.message);
  }
}
const express = require('express');
const mongoose = require('mongoose');

const cors = require('cors');
const path = require('path');
const QRCode = require('qrcode');
const cron = require('node-cron');
const { runBackup } = require('./backup');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

// Global Logger Middleware
app.use((req, res, next) => {
  console.log(`📡 [${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    const keys = Object.keys(req.body);
    console.log(`   └─ Body Keys: [${keys.join(', ')}]`);
  }
  next();
});

// Serve Static Frontend Assets
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================================================
// MongoDB Database Mongoose Configuration & Schemas
// ==========================================================================

const MONGODB_URI = process.env.MONGODB_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017/smart_collection';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Successfully connected to MongoDB database.');
    seedDatabase();
    
    // Schedule automated database backups every day at midnight (00:00)
    cron.schedule('0 0 * * *', async () => {
      console.log('⏰ [Cron Scheduler] Running automated database backup...');
      await runBackup();
    });
    console.log('⏰ [Cron Scheduler] Automated daily backups scheduled successfully (Midnight).');
  })
  .catch((err) => {
    console.error('❌ MongoDB Connection Error:', err.message);
    console.log('ℹ️ Please ensure MongoDB server is running locally (mongodb://localhost:27017).');
  });

// Schema 1: Product Model
const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, enum: ['children', 'girls', 'men'], required: true },
  price: { type: Number, required: true },
  cost: { type: Number, default: 0 },
  salePrice: { type: Number, default: null },
  image: { type: String, required: true },
  imageBack: { type: String, default: '' },
  imageSide: { type: String, default: '' },
  imageZoom: { type: String, default: '' },
  stock: { type: Number, required: true, default: 0 },
  available: { type: Boolean, default: true },
  desc: { type: String, required: true },
  sizes: { type: [String], default: [] },
  event: { type: String, default: "" }
});
const Product = mongoose.model('Product', ProductSchema);

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  date: { type: String, required: true },
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    price: Number,
    image: String,
    qty: Number
  }],
  subtotal: { type: Number, required: true },
  delivery: { type: String, required: true },
  address: String,
  customerName: { type: String, required: true },
  customerPhone: { type: String, required: true },
  customerEmail: { type: String, default: "" },
  status: { type: String, default: "Order Received" },
  loyaltyDiscount: { type: Number, default: 0 },
  pointsRedeemed: { type: Number, default: 0 },
  deliveryDate: { type: String, default: "" },
  trackingCourier: { type: String, default: "" },
  trackingNumber: { type: String, default: "" },
  cancelReason: { type: String, default: "" },
  transactionId: { type: String, default: "" },
  paymentScreenshot: { type: String, default: "" }
});
const Order = mongoose.model('Order', OrderSchema);

// Schema 3: Review Model
const ReviewSchema = new mongoose.Schema({
  reviewId: { type: String, required: true, unique: true },
  orderId: String,
  productId: String,
  productName: String,
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, required: true },
  date: { type: String, required: true },
  approved: { type: Boolean, default: false }
});
const Review = mongoose.model('Review', ReviewSchema);

// Schema 4: Exchange Model
const ExchangeSchema = new mongoose.Schema({
  exchangeId: { type: String, required: true, unique: true },
  orderId: String,
  productId: String,
  productName: String,
  reason: { type: String, required: true },
  details: { type: String, required: true },
  status: { type: String, default: "Pending Admin Approval" },
  date: { type: String, required: true },
  updateCount: { type: Number, default: 0 },
  adminFeedback: { type: String, default: "" }
});
const Exchange = mongoose.model('Exchange', ExchangeSchema);

// Schema 5: Customer Model
const CustomerSchema = new mongoose.Schema({
  phone: { type: String, unique: true, sparse: true },
  password: { type: String, default: "123456" },
  name: { type: String, default: "" },
  googleId: { type: String, unique: true, sparse: true },
  email: { type: String, unique: true, sparse: true },
  picture: { type: String, default: "" },
  role: { type: String, enum: ["customer", "admin"], default: "customer" },
  addresses: [{
    label: { type: String, default: "Home" },
    addressLine: { type: String, required: true }
  }],
  loyaltyPoints: { type: Number, default: 0 },
  referralCode: { type: String, unique: true },
  referredBy: { type: String, default: null },
  referredUsersCount: { type: Number, default: 0 },
  wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }]
});
const Customer = mongoose.model('Customer', CustomerSchema);

// Schema 6: Audit Log Model
const AuditLogSchema = new mongoose.Schema({
  timestamp: { type: String, required: true },
  action: { type: String, required: true },
  details: { type: String, required: true },
  operator: { type: String, required: true }
});
const AuditLog = mongoose.model('AuditLog', AuditLogSchema);

// Schema 7: Newsletter Subscriber Model
const SubscriberSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  subscribedAt: { type: Date, default: Date.now }
});
const Subscriber = mongoose.model('Subscriber', SubscriberSchema);

// Schema 8: Flash Sale Settings Model
const FlashSaleSettingsSchema = new mongoose.Schema({
  key: { type: String, default: "active_flash_sale" },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  isActive: { type: Boolean, default: true }
});
const FlashSaleSettings = mongoose.model('FlashSaleSettings', FlashSaleSettingsSchema);

// Schema 9: Banner Model
const BannerSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subtitle: { type: String, default: "" },
  description: { type: String, default: "" },
  image: { type: String, required: true },
  ctaText: { type: String, default: "Explore Shop" },
  ctaTab: { type: String, default: "shop" },
  categoryFilter: { type: String, default: "" },
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 }
});
const Banner = mongoose.model('Banner', BannerSchema);

// Schema 10: Bundle Model
const BundleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subtitle: { type: String, default: "" },
  description: { type: String, default: "" },
  productA: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productB: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  price: { type: Number, required: true },
  isActive: { type: Boolean, default: true }
});
const Bundle = mongoose.model('Bundle', BundleSchema);

// Schema 11: Bundle Settings Model
const BundleSettingsSchema = new mongoose.Schema({
  key: { type: String, default: "bundle_settings" },
  mixMatchDiscount: { type: Number, default: 15 },
  aiDiscount: { type: Number, default: 20 }
});
const BundleSettings = mongoose.model('BundleSettings', BundleSettingsSchema);

async function isFlashSaleCurrentlyActive() {
  try {
    const settings = await FlashSaleSettings.findOne({ key: "active_flash_sale" });
    if (!settings || !settings.isActive) return false;
    
    const now = new Date();
    const start = settings.startDate ? new Date(settings.startDate) : null;
    const end = settings.endDate ? new Date(settings.endDate) : null;
    
    return start && end && now >= start && now <= end;
  } catch (err) {
    console.error("Error in isFlashSaleCurrentlyActive:", err);
    return false;
  }
}

async function logAudit(action, details, operator = "System") {
  try {
    const log = new AuditLog({
      timestamp: new Date().toISOString(),
      action,
      details,
      operator
    });
    await log.save();
    console.log(`[Audit Log] ${action}: ${details} by ${operator}`);
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}


// ==========================================================================
// Catalog Seeding Database Seeder
// ==========================================================================

async function seedDatabase() {
  try {
    // Drop old indexes to clear the non-sparse unique phone index constraint
    await Customer.collection.dropIndexes().catch(err => console.log("Note: Customer collection index drop ignored:", err.message));

    // Seed default Admin user
    const existingAdmin = await Customer.findOne({ phone: "7575757575" });
    if (!existingAdmin) {
      const adminCustomer = new Customer({
        phone: "7575757575",
        name: "Admin Manager",
        role: "admin",
        loyaltyPoints: 1000,
        referralCode: "SC-ADMIN75"
      });
      await adminCustomer.save();
      console.log("👑 Seeded default Admin Customer (Phone: 7575757575)");
    }

    const count = await Product.countDocuments();
    if (count === 0) {
      console.log('🌱 Database is empty. Seeding default Smart Collection catalog...');
      const seedProducts = [
        {
          name: "Kids Playful Dungaree Set",
          category: "children",
          price: 499,
          image: "images/kids_dungaree.png",
          imageBack: "images/kids_dungaree.png",
          imageSide: "images/kids_dungaree.png",
          imageZoom: "images/kids_dungaree.png",
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
          imageBack: "images/kids_coord.png",
          imageSide: "images/kids_coord.png",
          imageZoom: "images/kids_coord.png",
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
          imageBack: "images/girls_gown.png",
          imageSide: "images/girls_gown.png",
          imageZoom: "images/girls_gown.png",
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
          imageBack: "images/girls_frock.png",
          imageSide: "images/girls_frock.png",
          imageZoom: "images/girls_frock.png",
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
          imageBack: "images/men_shirt.png",
          imageSide: "images/men_shirt.png",
          imageZoom: "images/men_shirt.png",
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
          imageBack: "images/men_chinos.png",
          imageSide: "images/men_chinos.png",
          imageZoom: "images/men_chinos.png",
          stock: 6,
          available: true,
          desc: "Perfectly tailored stretch-cotton trousers. Seamless transition from office desk to weekend dinners. Wrinkle-resistant fabric.",
          sizes: ["S", "M", "L", "XL", "XXL"]
        }
      ];
      await Product.insertMany(seedProducts);
      console.log('🌱 Seeding successful! 6 products added.');
    }

    // Auto-migrate existing products to populate default values
    const allProds = await Product.find({});
    let migratedSizesCount = 0;
    let migratedImagesCount = 0;
    let migratedEventsCount = 0;
    
    for (const p of allProds) {
      let changed = false;
      
      // Sizes migration
      if (!p.sizes || p.sizes.length === 0) {
        let defaultSizes = [];
        if (p.category === 'children') defaultSizes = ['2-3Y', '4-5Y', '5-6Y'];
        else if (p.category === 'girls') defaultSizes = ['S', 'M', 'L', 'XL'];
        else if (p.category === 'men') defaultSizes = ['S', 'M', 'L', 'XL', 'XXL'];
        
        p.sizes = defaultSizes;
        changed = true;
        migratedSizesCount++;
      }
      
      // Multiple Images migration
      if (p.imageBack === undefined || p.imageBack === '') {
        p.imageBack = p.image;
        changed = true;
        migratedImagesCount++;
      }
      if (p.imageSide === undefined || p.imageSide === '') {
        p.imageSide = p.image;
        changed = true;
      }
      if (p.imageZoom === undefined || p.imageZoom === '') {
        p.imageZoom = p.image;
        changed = true;
      }
      
      // Sale price migration
      if (p.salePrice === undefined) {
        p.salePrice = null;
        changed = true;
      }
      if (p.name === "Men's Premium Linen Shirt" && (p.salePrice === null || p.salePrice === undefined)) {
        p.salePrice = 799;
        changed = true;
      }

      // Event migration
      if (p.event === undefined || p.event === "") {
        let defaultEvent = "";
        const lowerName = p.name.toLowerCase();
        if (lowerName.includes("linen shirt") || lowerName.includes("chinos") || lowerName.includes("tshirt")) {
          defaultEvent = "office";
        } else if (lowerName.includes("gown")) {
          defaultEvent = "wedding";
        } else if (lowerName.includes("frock")) {
          defaultEvent = "birthday";
        } else if (lowerName.includes("dungaree") || lowerName.includes("co-ord")) {
          defaultEvent = "school";
        }
        
        if (defaultEvent !== "") {
          p.event = defaultEvent;
          changed = true;
          migratedEventsCount++;
        }
      }
      
      if (changed) {
        await p.save();
      }
    }
    
    if (migratedSizesCount > 0) {
      console.log(`✅ Auto-migrated ${migratedSizesCount} products to add default category sizes.`);
    }
    if (migratedImagesCount > 0) {
      console.log(`✅ Auto-migrated ${migratedImagesCount} products to add default back/side/zoom views.`);
    }
    if (migratedEventsCount > 0) {
      console.log(`✅ Auto-migrated ${migratedEventsCount} products to assign default event tags.`);
    }

    // Auto-migrate orders to fix legacy orders with null productId references
    const allOrders = await Order.find({});
    let migratedOrdersCount = 0;
    for (const order of allOrders) {
      let orderChanged = false;
      for (const item of order.items) {
        if (!item.productId) {
          const prodName = item.name.split(" (Size:")[0];
          const dbProduct = await Product.findOne({ name: prodName });
          if (dbProduct) {
            item.productId = dbProduct._id;
            orderChanged = true;
          }
        }
      }
      
      // Also migrate legacy delivered orders to have deliveryDate set (fallback to current date/time)
      if (order.status === 'Delivered' && !order.deliveryDate) {
        order.deliveryDate = new Date().toISOString();
        orderChanged = true;
      }

      if (order.trackingCourier === undefined) {
        order.trackingCourier = "";
        orderChanged = true;
      }
      if (order.trackingNumber === undefined) {
        order.trackingNumber = "";
        orderChanged = true;
      }

      if (orderChanged) {
        await order.save();
        migratedOrdersCount++;
      }
    }
    if (migratedOrdersCount > 0) {
      console.log(`✅ Auto-migrated ${migratedOrdersCount} orders to restore missing productId references.`);
    }

    // Auto-migrate exchanges to add updateCount and adminFeedback
    const allExchanges = await Exchange.find({});
    let migratedExchangesCount = 0;
    for (const ex of allExchanges) {
      let changed = false;
      if (ex.updateCount === undefined || ex.updateCount === null) {
        ex.updateCount = ex.status === "Pending Admin Approval" ? 0 : 1;
        changed = true;
      }
      if (ex.adminFeedback === undefined || ex.adminFeedback === null) {
        ex.adminFeedback = "";
        changed = true;
      }
      if (changed) {
        await ex.save();
        migratedExchangesCount++;
      }
    }
    if (migratedExchangesCount > 0) {
      console.log(`✅ Auto-migrated ${migratedExchangesCount} exchanges with default status constraints.`);
    }

    // Auto-migrate reviews to add approved field
    const allReviews = await Review.find({});
    let migratedReviewsCount = 0;
    for (const rev of allReviews) {
      if (rev.approved === undefined || rev.approved === null) {
        rev.approved = true; // default existing reviews to approved
        await rev.save();
        migratedReviewsCount++;
      }
    }
    if (migratedReviewsCount > 0) {
      console.log(`✅ Auto-migrated ${migratedReviewsCount} reviews to be approved by default.`);
    }

    // Seed default Flash Sale settings
    const existingSettings = await FlashSaleSettings.findOne({ key: "active_flash_sale" });
    if (!existingSettings) {
      const defaultSettings = new FlashSaleSettings({
        key: "active_flash_sale",
        startDate: new Date(),
        // End in 24 hours from now by default
        endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isActive: true
      });
      await defaultSettings.save();
      console.log("⚡ Seeded default Flash Sale Settings (24 hours duration)");
    } else {
      // If it exists but is expired, let's update it to start now and end in 24 hours so it is active
      const now = new Date();
      if (existingSettings.endDate && now > new Date(existingSettings.endDate)) {
        existingSettings.startDate = now;
        existingSettings.endDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
        existingSettings.isActive = true;
        await existingSettings.save();
        console.log("⚡ Updated expired Flash Sale Settings to be active for 24 hours");
      }
    }

    // Seed default Dynamic Banners (Eid Sale, Diwali Sale, Rakhi Sale, Wedding Collection)
    const bannerCount = await Banner.countDocuments();
    if (bannerCount === 0) {
      const seedBanners = [
        {
          title: "Eid Sale",
          subtitle: "Celebrate Eid in Style",
          description: "Explore our premium selection of ready-made kurta sets, dresses, and children wear for Eid. Brighten up the festivities with modern elegance.",
          image: "images/fashion_banner_2.png",
          ctaText: "Shop Collection",
          ctaTab: "shop",
          categoryFilter: "",
          isActive: true,
          order: 0
        },
        {
          title: "Diwali Sale",
          subtitle: "Vibrant Festive Outfits",
          description: "Brighten your Diwali with exclusive traditional-contemporary garments. Made from breathable fabrics with beautiful designs for Men, Girls, and Kids.",
          image: "images/fashion_banner_3.png",
          ctaText: "Browse Diwali Deals",
          ctaTab: "shop",
          categoryFilter: "",
          isActive: true,
          order: 1
        },
        {
          title: "Wedding Collection",
          subtitle: "Premium Occasion Wear",
          description: "Look your absolute best for celebrations. Premium tailored ready-made gowns, dresses, and formal wear crafted for all special family occasions.",
          image: "images/fashion_banner_1.png",
          ctaText: "Shop Occasion Wear",
          ctaTab: "shop",
          categoryFilter: "girls",
          isActive: true,
          order: 2
        },
        {
          title: "Rakhi Special",
          subtitle: "Perfect Outfits for Siblings",
          description: "Express sibling love with beautiful coordinated frocks, co-ord sets, and shirts. Durable, comfortable and premium children clothing for Raksha Bandhan.",
          image: "images/fashion_banner_2.png",
          ctaText: "Shop Kids Wear",
          ctaTab: "shop",
          categoryFilter: "children",
          isActive: true,
          order: 3
        }
      ];
      await Banner.insertMany(seedBanners);
      console.log("🎏 Seeded default Dynamic Banners (Eid, Diwali, Wedding, Rakhi)");
    }

    // Seed default Bundle Settings
    const existingBundleSettings = await BundleSettings.findOne({ key: "bundle_settings" });
    if (!existingBundleSettings) {
      const defaultBundleSettings = new BundleSettings({
        key: "bundle_settings",
        mixMatchDiscount: 15,
        aiDiscount: 20
      });
      await defaultBundleSettings.save();
      console.log("⚡ Seeded default Outfit Bundle Settings (Mix & Match: 15%, AI: 20%)");
    }

    // Seed default pre-defined Outfit Bundles
    const bundleCount = await Bundle.countDocuments();
    if (bundleCount === 0) {
      const menShirt = await Product.findOne({ name: "Men's Premium Linen Shirt" });
      const menChinos = await Product.findOne({ name: "Men's Smart Casual Chinos" });
      const girlsGown = await Product.findOne({ name: "Girls Enchanted Floral Gown" });
      const girlsFrock = await Product.findOne({ name: "Girls Modern Summer Frock" });
      const kidsDungaree = await Product.findOne({ name: "Kids Playful Dungaree Set" });
      const kidsCoord = await Product.findOne({ name: "Toddler Cozy Cotton Co-ord" });

      const seedBundles = [];

      if (menShirt && menChinos) {
        seedBundles.push({
          title: "Men's Smart Casual Look",
          subtitle: "Linen Shirt + Chinos Deal",
          description: "Look sharp with our premium pure linen shirt paired with comfortable, stretch-tailored casual chinos.",
          productA: menShirt._id,
          productB: menChinos._id,
          price: 1899,
          isActive: true
        });
      }

      if (girlsGown && girlsFrock) {
        seedBundles.push({
          title: "Girls Festive Celebration Set",
          subtitle: "Lace Floral Gown + Summer Frock",
          description: "Double the elegance! Includes the stunning lace-styled floral gown and a breathable modern summer frock.",
          productA: girlsGown._id,
          productB: girlsFrock._id,
          price: 1599,
          isActive: true
        });
      }

      if (kidsDungaree && kidsCoord) {
        seedBundles.push({
          title: "Toddler Playtime Combo",
          subtitle: "Cotton Dungaree + Cozy Co-ord",
          description: "Comfortable playtime essentials featuring a playful cotton dungaree set and a super-soft cozy co-ord.",
          productA: kidsDungaree._id,
          productB: kidsCoord._id,
          price: 899,
          isActive: true
        });
      }

      if (seedBundles.length > 0) {
        await Bundle.insertMany(seedBundles);
        console.log(`📦 Seeded default Outfit Bundles (${seedBundles.length} bundles loaded)`);
      }
    }
  } catch (error) {
    console.error('❌ Seeding Error:', error.message);
  }
}

// ==========================================================================
// REST API Endpoint Routing Definitions
// ==========================================================================

// --- MARKETING / NEWSLETTER ROUTES ---

// Subscribe to newsletter
app.post('/api/newsletter/subscribe', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    
    // Check if already subscribed
    const existing = await Subscriber.findOne({ email });
    if (existing) {
      return res.status(200).json({ message: "You are already subscribed to our newsletter!" });
    }
    
    const subscriber = new Subscriber({ email });
    await subscriber.save();
    
    res.status(201).json({ message: "Thank you for subscribing to our newsletter!" });
  } catch (err) {
    console.error("Newsletter Subscription Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// --- FLASH SALE TIMER ROUTES ---

// Get active settings
app.get('/api/flash-sale/settings', async (req, res) => {
  try {
    let settings = await FlashSaleSettings.findOne({ key: "active_flash_sale" });
    if (!settings) {
      settings = new FlashSaleSettings({
        key: "active_flash_sale",
        startDate: new Date(),
        endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isActive: true
      });
      await settings.save();
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update settings
app.post('/api/flash-sale/settings', async (req, res) => {
  try {
    const { startDate, endDate, isActive } = req.body;
    let settings = await FlashSaleSettings.findOne({ key: "active_flash_sale" });
    if (!settings) {
      settings = new FlashSaleSettings({ key: "active_flash_sale" });
    }
    
    settings.startDate = startDate ? new Date(startDate) : null;
    settings.endDate = endDate ? new Date(endDate) : null;
    settings.isActive = (isActive !== undefined) ? !!isActive : true;
    
    await settings.save();
    
    const operator = req.headers['x-operator'] || "System";
    await logAudit("FLASH_SALE_TIMER_UPDATE", `Updated Flash Sale Campaign: Active=${settings.isActive}, Start=${settings.startDate}, End=${settings.endDate}.`, operator);
    
    res.json(settings);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- PRODUCTS ROUTES ---

// 1. GET all products
app.get('/api/products', async (req, res) => {
  try {
    const list = await Product.find({});
    const active = await isFlashSaleCurrentlyActive();
    if (!active) {
      const mappedList = list.map(p => {
        const obj = p.toObject();
        obj.salePrice = null;
        return obj;
      });
      return res.json(mappedList);
    }
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. POST create new product
app.post('/api/products', async (req, res) => {
  try {
    const newProduct = new Product(req.body);
    await newProduct.save();
    const operator = req.headers['x-operator'] || "System";
    await logAudit("PRODUCT_CREATE", `Created new product '${newProduct.name}' (Category: ${newProduct.category}, Price: ₹${newProduct.price}).`, operator);
    res.status(201).json(newProduct);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3. PUT edit stock count
app.put('/api/products/:id/stock', async (req, res) => {
  try {
    const { stock } = req.body;
    const available = stock > 0;
    const original = await Product.findById(req.params.id);
    if (!original) return res.status(404).json({ error: 'Product not found' });
    
    const oldStock = original.stock;
    const updated = await Product.findByIdAndUpdate(
      req.params.id, 
      { stock, available }, 
      { new: true }
    );
    const operator = req.headers['x-operator'] || "System";
    await logAudit("STOCK_UPDATE", `Updated stock of product '${updated.name}' from ${oldStock} to ${stock}.`, operator);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3b. PUT edit price
app.put('/api/products/:id/price', async (req, res) => {
  try {
    const { price } = req.body;
    const original = await Product.findById(req.params.id);
    if (!original) return res.status(404).json({ error: 'Product not found' });
    
    const oldPrice = original.price;
    const updated = await Product.findByIdAndUpdate(
      req.params.id, 
      { price: parseInt(price) || 0 }, 
      { new: true }
    );
    const operator = req.headers['x-operator'] || "System";
    await logAudit("PRICE_UPDATE", `Updated price of product '${updated.name}' from ₹${oldPrice} to ₹${price}.`, operator);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3c. PUT edit wholesale cost
app.put('/api/products/:id/cost', async (req, res) => {
  try {
    const { cost } = req.body;
    const original = await Product.findById(req.params.id);
    if (!original) return res.status(404).json({ error: 'Product not found' });
    
    const oldCost = original.cost;
    const updated = await Product.findByIdAndUpdate(
      req.params.id, 
      { cost: parseInt(cost) || 0 }, 
      { new: true }
    );
    const operator = req.headers['x-operator'] || "System";
    await logAudit("COST_UPDATE", `Updated wholesale cost of product '${updated.name}' from ₹${oldCost || 0} to ₹${cost}.`, operator);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3c. PUT edit name
app.put('/api/products/:id/name', async (req, res) => {
  try {
    const { name } = req.body;
    const original = await Product.findById(req.params.id);
    if (!original) return res.status(404).json({ error: 'Product not found' });
    
    const oldName = original.name;
    const updated = await Product.findByIdAndUpdate(
      req.params.id, 
      { name }, 
      { new: true }
    );
    const operator = req.headers['x-operator'] || "System";
    await logAudit("NAME_UPDATE", `Updated name of product from '${oldName}' to '${name}'.`, operator);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3d. PUT edit image
app.put('/api/products/:id/image', async (req, res) => {
  try {
    const { image, view } = req.body;
    let updateFields = {};
    if (view === 'back') updateFields.imageBack = image;
    else if (view === 'side') updateFields.imageSide = image;
    else if (view === 'zoom') updateFields.imageZoom = image;
    else updateFields.image = image;

    const updated = await Product.findByIdAndUpdate(
      req.params.id, 
      updateFields, 
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Product not found' });
    const operator = req.headers['x-operator'] || "System";
    await logAudit("IMAGE_UPDATE", `Uploaded new product image for view '${view || 'front'}' of '${updated.name}'.`, operator);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3e. PUT edit sizes
app.put('/api/products/:id/sizes', async (req, res) => {
  try {
    const { sizes } = req.body;
    let sizesArray = [];
    if (Array.isArray(sizes)) {
      sizesArray = sizes.map(s => s.trim()).filter(Boolean);
    } else if (typeof sizes === 'string') {
      sizesArray = sizes.split(',').map(s => s.trim()).filter(Boolean);
    }
    const original = await Product.findById(req.params.id);
    if (!original) return res.status(404).json({ error: 'Product not found' });
    
    const oldSizes = original.sizes.join(', ');
    const updated = await Product.findByIdAndUpdate(
      req.params.id, 
      { sizes: sizesArray }, 
      { new: true }
    );
    const operator = req.headers['x-operator'] || "System";
    await logAudit("SIZES_UPDATE", `Updated sizes of product '${updated.name}' from [${oldSizes}] to [${sizesArray.join(', ')}].`, operator);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3f. PUT edit sale price
app.put('/api/products/:id/sale-price', async (req, res) => {
  try {
    const { salePrice } = req.body;
    const val = (salePrice === '' || salePrice === null || salePrice === undefined || parseInt(salePrice) <= 0) ? null : parseInt(salePrice);
    const original = await Product.findById(req.params.id);
    if (!original) return res.status(404).json({ error: 'Product not found' });
    
    const oldSalePrice = original.salePrice;
    const updated = await Product.findByIdAndUpdate(
      req.params.id, 
      { salePrice: val }, 
      { new: true }
    );
    const operator = req.headers['x-operator'] || "System";
    await logAudit("SALE_PRICE_UPDATE", `Updated sale price of product '${updated.name}' from ₹${oldSalePrice || 'None'} to ₹${val || 'None'}.`, operator);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3g. PUT edit description
app.put('/api/products/:id/desc', async (req, res) => {
  try {
    const { desc } = req.body;
    const updated = await Product.findByIdAndUpdate(
      req.params.id, 
      { desc }, 
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Product not found' });
    const operator = req.headers['x-operator'] || "System";
    await logAudit("DESC_UPDATE", `Updated description of product '${updated.name}'.`, operator);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3h. PUT edit event
app.put('/api/products/:id/event', async (req, res) => {
  try {
    const { event } = req.body;
    const original = await Product.findById(req.params.id);
    if (!original) return res.status(404).json({ error: 'Product not found' });
    
    const oldEvent = original.event || "None";
    const updated = await Product.findByIdAndUpdate(
      req.params.id, 
      { event: event || "" }, 
      { new: true }
    );
    const operator = req.headers['x-operator'] || "System";
    await logAudit("EVENT_UPDATE", `Updated occasion event of product '${updated.name}' from '${oldEvent}' to '${event || 'None'}'.`, operator);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 4. PUT toggle availability
app.put('/api/products/:id/availability', async (req, res) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Product not found' });
    p.available = !p.available;
    await p.save();
    const operator = req.headers['x-operator'] || "System";
    await logAudit("AVAILABILITY_TOGGLE", `Toggled availability of product '${p.name}' to ${p.available}.`, operator);
    res.json(p);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5. DELETE product
app.delete('/api/products/:id', async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Product not found' });
    const operator = req.headers['x-operator'] || "System";
    await logAudit("PRODUCT_DELETE", `Deleted product '${deleted.name}' (Category: ${deleted.category}).`, operator);
    res.json({ success: true, deletedId: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================================================
// CUSTOMER AUTHENTICATION & MEMBERSHIP ROUTES
// ==========================================================================

const otpStore = new Map();

// Generate & Send OTP
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });
    let cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length === 12 && cleanPhone.startsWith("91")) {
      cleanPhone = cleanPhone.slice(2);
    } else if (cleanPhone.length === 11 && cleanPhone.startsWith("0")) {
      cleanPhone = cleanPhone.slice(1);
    }
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ error: 'Phone number must be exactly 10 digits' });
    }
    
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(cleanPhone, { otp, expires: Date.now() + 5 * 60 * 1000 });
    
    console.log(`\n💬 [SMS Gateway Sandbox] Sent OTP code: ${otp} to phone: +91 ${cleanPhone}\n`);
    
    res.json({
      success: true,
      message: 'OTP sent successfully (Simulated SMS)',
      otp // Return it for sandbox alert display
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify OTP (Login / Register)
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { phone, otp, name, referralCode } = req.body;
    if (!phone || !otp) return res.status(400).json({ error: 'Phone and OTP are required' });
    
    let cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length === 12 && cleanPhone.startsWith("91")) {
      cleanPhone = cleanPhone.slice(2);
    } else if (cleanPhone.length === 11 && cleanPhone.startsWith("0")) {
      cleanPhone = cleanPhone.slice(1);
    }
    const record = otpStore.get(cleanPhone);
    
    if (!record || record.otp !== otp.trim() || Date.now() > record.expires) {
      return res.status(400).json({ error: 'Invalid or expired OTP code' });
    }
    
    // OTP is valid! Clear it
    otpStore.delete(cleanPhone);
    
    let customer = await Customer.findOne({ phone: cleanPhone }).populate('wishlist');
    let isNew = false;
    
    if (!customer) {
      isNew = true;
      // Generate unique referral code
      let refCode = '';
      while (true) {
        refCode = 'SC-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        const existingRef = await Customer.findOne({ referralCode: refCode });
        if (!existingRef) break;
      }
      
      let referredByCode = null;
      let pointsAwarded = 0;
      
      if (referralCode) {
        const referrer = await Customer.findOne({ referralCode: referralCode.trim().toUpperCase() });
        if (referrer) {
          referredByCode = referrer.referralCode;
          pointsAwarded = 50; // referee gets 50 points
          referrer.referredUsersCount += 1;
          await referrer.save();
        }
      }
      
      // Auto-assign admin role for designated numbers
      const role = (cleanPhone === "7575757575" || cleanPhone === "9999999999") ? "admin" : "customer";
      
      customer = new Customer({
        phone: cleanPhone,
        name: name ? name.trim() : `Customer_${cleanPhone.slice(-4)}`,
        role: role,
        loyaltyPoints: pointsAwarded,
        referralCode: refCode,
        referredBy: referredByCode
      });
      
      await customer.save();
    } else {
      // Update role if they are logging in with a designated admin number
      if (cleanPhone === "7575757575" || cleanPhone === "9999999999") {
        if (customer.role !== "admin") {
          customer.role = "admin";
          await customer.save();
        }
      }
    }
    
    res.json({
      success: true,
      message: isNew ? 'Registration successful' : 'Login successful',
      customer
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Google Client ID Config
app.get('/api/config/google-client-id', (req, res) => {
  res.json({ clientId: process.env.GOOGLE_CLIENT_ID || "1039845700248-sandbox.apps.googleusercontent.com" });
});

// Google Sign-In verification
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Google credential token is required' });
    
    // Decode JWT token safely on the server
    const base64Url = credential.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
    const payload = JSON.parse(jsonPayload);
    
    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name;
    const picture = payload.picture || '';
    
    if (!googleId || !email) {
      return res.status(400).json({ error: 'Invalid Google credential claims' });
    }
    
    let customer = await Customer.findOne({ $or: [{ googleId }, { email }] }).populate('wishlist');
    let isNew = false;
    
    if (!customer) {
      isNew = true;
      // Generate unique referral code
      let refCode = '';
      while (true) {
        refCode = 'SC-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        const existingRef = await Customer.findOne({ referralCode: refCode });
        if (!existingRef) break;
      }
      
      // Auto-assign admin role if email matches designated patterns
      const lowerEmail = email.toLowerCase();
      const role = (lowerEmail === "smart7575@gmail.com" || lowerEmail === "admin@smartcollection.com" || lowerEmail.includes("admin")) ? "admin" : "customer";
      
      customer = new Customer({
        googleId,
        email,
        name: name ? name.trim() : 'Google User',
        picture,
        role: role,
        loyaltyPoints: 0,
        referralCode: refCode
      });
      
      await customer.save();
    } else {
      // Keep profile info updated
      let modified = false;
      if (!customer.googleId) { customer.googleId = googleId; modified = true; }
      if (!customer.picture) { customer.picture = picture; modified = true; }
      // Ensure email contains 'admin' -> admin role
      const lowerEmail = email.toLowerCase();
      if (lowerEmail === "smart7575@gmail.com" || lowerEmail === "admin@smartcollection.com" || lowerEmail.includes("admin")) {
        if (customer.role !== "admin") {
          customer.role = "admin";
          modified = true;
        }
      }
      if (modified) {
        await customer.save();
      }
    }
    
    res.json({
      success: true,
      message: isNew ? 'Registration via Google successful' : 'Login via Google successful',
      customer
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to look up customer by either phone number or Mongoose ObjectId
async function findCustomerByIdentifier(identifier) {
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    return await Customer.findById(identifier);
  }
  const cleanPhone = identifier.replace(/\D/g, "");
  return await Customer.findOne({ phone: cleanPhone });
}

// Get Customer Profile details
app.get('/api/customers/:phone', async (req, res) => {
  try {
    const customer = await findCustomerByIdentifier(req.params.phone);
    if (!customer) return res.status(404).json({ error: 'Customer profile not found' });
    const populated = await customer.populate('wishlist');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Customer Profile Name
app.put('/api/customers/:phone/profile', async (req, res) => {
  try {
    const { name } = req.body;
    const customer = await findCustomerByIdentifier(req.params.phone);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    customer.name = name.trim();
    await customer.save();
    res.json(customer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Add address
app.post('/api/customers/:phone/addresses', async (req, res) => {
  try {
    const { label, addressLine } = req.body;
    if (!addressLine) return res.status(400).json({ error: 'Address text is required' });
    
    const customer = await findCustomerByIdentifier(req.params.phone);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    customer.addresses.push({
      label: label ? label.trim() : 'Home',
      addressLine: addressLine.trim()
    });

    await customer.save();
    res.status(201).json(customer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete address
app.delete('/api/customers/:phone/addresses/:addressId', async (req, res) => {
  try {
    const customer = await findCustomerByIdentifier(req.params.phone);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    customer.addresses = customer.addresses.filter(
      addr => addr._id.toString() !== req.params.addressId
    );

    await customer.save();
    res.json(customer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Add product to wishlist
app.post('/api/customers/:phone/wishlist', async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ error: 'Product ID is required' });

    const customer = await findCustomerByIdentifier(req.params.phone);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const productExists = await Product.findById(productId);
    if (!productExists) return res.status(404).json({ error: 'Product not found' });

    // Add to wishlist if not already present
    if (!customer.wishlist.includes(productId)) {
      customer.wishlist.push(productId);
      await customer.save();
    }

    const populated = await customer.populate('wishlist');
    res.json(populated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Remove product from wishlist
app.delete('/api/customers/:phone/wishlist/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const customer = await findCustomerByIdentifier(req.params.phone);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    customer.wishlist = customer.wishlist.filter(
      id => id.toString() !== productId
    );
    await customer.save();

    const populated = await customer.populate('wishlist');
    res.json(populated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// --- ORDERS ROUTES ---

// 1. GET all orders
app.get('/api/orders', async (req, res) => {
  try {
    const list = await Order.find({}).sort({ _id: -1 }); // newest first
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. POST submit new order
app.post('/api/orders', async (req, res) => {
  try {
    const orderData = req.body;
    let cleanPhone = orderData.customerPhone.replace(/\D/g, "");
    if (cleanPhone.length === 12 && cleanPhone.startsWith("91")) {
      cleanPhone = cleanPhone.slice(2);
    } else if (cleanPhone.length === 11 && cleanPhone.startsWith("0")) {
      cleanPhone = cleanPhone.slice(1);
    }
    // Resolve prices server-side to prevent tampering or handle expired sales
    const active = await isFlashSaleCurrentlyActive();
    let calculatedSubtotal = 0;
    for (const item of orderData.items) {
      const dbProduct = await Product.findById(item.productId || item.id);
      if (!dbProduct) {
        return res.status(404).json({ error: `Product not found` });
      }
      const resolvedPrice = (active && dbProduct.salePrice && dbProduct.salePrice < dbProduct.price) 
        ? dbProduct.salePrice 
        : dbProduct.price;
      item.price = resolvedPrice;
      calculatedSubtotal += resolvedPrice * item.qty;
    }
    orderData.subtotal = calculatedSubtotal;

    // Decrement stocks for all checkout items
    for (const item of orderData.items) {
      const dbProduct = await Product.findById(item.productId || item.id);
      if (dbProduct) {
        dbProduct.stock = Math.max(0, dbProduct.stock - item.qty);
        if (dbProduct.stock === 0) {
          dbProduct.available = false;
        }
        await dbProduct.save();
      }
    }

    // Process Loyalty points deduction and additions
    let loyaltyDiscount = 0;
    let pointsRedeemed = 0;
    
    let customer = null;
    if (orderData.customerEmail) {
      customer = await Customer.findOne({ $or: [{ phone: cleanPhone }, { email: orderData.customerEmail }] });
    } else {
      customer = await Customer.findOne({ phone: cleanPhone });
    }
    
    if (customer) {
      // Link phone number to Google user profile if not set and not already taken
      if (!customer.phone && cleanPhone) {
        const phoneExists = await Customer.findOne({ phone: cleanPhone });
        if (!phoneExists) {
          customer.phone = cleanPhone;
        }
      }

      if (customer.loyaltyPoints >= 200 && orderData.redeemPoints && orderData.pointsRedeemed) {
        pointsRedeemed = Math.min(customer.loyaltyPoints, parseInt(orderData.pointsRedeemed) || 0);
        loyaltyDiscount = pointsRedeemed * 0.5; // 1 point = ₹0.50 when points >= 200
        
        // Deduct points from profile
        customer.loyaltyPoints -= pointsRedeemed;
      }

      // Check if this is their first completed order to credit referral points to referrer
      const query = { $or: [{ customerPhone: cleanPhone }] };
      if (customer.email) {
        query.$or.push({ customerEmail: customer.email });
      }
      const previousOrdersCount = await Order.countDocuments(query);
      if (previousOrdersCount === 0 && customer.referredBy) {
        const referrer = await Customer.findOne({ referralCode: customer.referredBy });
        if (referrer) {
          referrer.loyaltyPoints += 100; // Referrer gets 100 points
          await referrer.save();
          console.log(`[REFERRAL BONUS] Referrer ${referrer.phone || referrer.email} awarded 100 points for first purchase of customer ${cleanPhone}`);
        }
      }

      // Earn points on current order (1 point for every ₹10 spent on final subtotal)
      const finalPaidAmount = Math.max(0, orderData.subtotal - loyaltyDiscount);
      const pointsEarned = Math.floor(finalPaidAmount / 10);
      customer.loyaltyPoints += pointsEarned;
      
      await customer.save();
      console.log(`[LOYALTY UPDATE] Customer ${customer.name}: Redeemed ${pointsRedeemed} pts (-₹${loyaltyDiscount}), Earned ${pointsEarned} pts. New Balance: ${customer.loyaltyPoints}`);
    }

    // Save order model
    const items = orderData.items.map(item => ({
      productId: item.productId || item.id,
      name: item.name,
      price: item.price,
      image: item.image,
      qty: item.qty
    }));

    const newOrder = new Order({
      orderId: orderData.orderId,
      date: orderData.date,
      items: items,
      subtotal: orderData.subtotal,
      delivery: orderData.delivery,
      address: orderData.address,
      customerName: orderData.customerName,
      customerPhone: orderData.customerPhone,
      customerEmail: orderData.customerEmail || "",
      status: "Order Received",
      loyaltyDiscount: loyaltyDiscount,
      pointsRedeemed: pointsRedeemed,
      transactionId: orderData.transactionId || "",
      paymentScreenshot: orderData.paymentScreenshot || ""
    });

    await newOrder.save();
    const operator = req.headers['x-operator'] || "System";
    await logAudit("ORDER_CREATE", `Placed new order SC-${newOrder.orderId} containing ${newOrder.items.length} items. Total: ₹${newOrder.subtotal}.`, operator);
    res.status(201).json(newOrder);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// 3. PUT update order status
app.put('/api/orders/:id/status', async (req, res) => {
  try {
    const { status, courier, trackingNum } = req.body;
    const updateFields = { status };
    if (status === 'Delivered') {
      updateFields.deliveryDate = new Date().toISOString();
    } else if (status === 'Shipped') {
      updateFields.trackingCourier = courier || 'Local Partner';
      updateFields.trackingNumber = trackingNum || `TRK-${Date.now().toString().slice(-6)}`;
    } else {
      updateFields.deliveryDate = '';
      updateFields.trackingCourier = '';
      updateFields.trackingNumber = '';
    }
    const original = await Order.findById(req.params.id);
    if (!original) return res.status(404).json({ error: 'Order not found' });
    const oldStatus = original.status;

    const updated = await Order.findByIdAndUpdate(
      req.params.id, 
      updateFields, 
      { new: true }
    );
    const operator = req.headers['x-operator'] || "System";
    await logAudit("ORDER_STATUS_UPDATE", `Updated status of order SC-${updated.orderId} from '${oldStatus}' to '${status}'.`, operator);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3b. PUT cancel order
app.put('/api/orders/:id/cancel', async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Validate state (Only Order Received, Confirmed, Pending or Paid & Ordered orders can be cancelled)
    if (order.status !== 'Order Received' && order.status !== 'Confirmed' && order.status !== 'Pending' && order.status !== 'Paid & Ordered') {
      return res.status(400).json({ error: 'Only pending or confirmed orders can be cancelled before packing/shipping.' });
    }

    // 1. Restore product stock counts
    for (const item of order.items) {
      const dbProduct = await Product.findById(item.productId);
      if (dbProduct) {
        dbProduct.stock += item.qty;
        // Make product available if stock is restored above 0
        if (dbProduct.stock > 0) {
          dbProduct.available = true;
        }
        await dbProduct.save();
      }
    }

    // 2. Adjust customer loyalty points
    const cleanPhone = order.customerPhone.replace(/\D/g, "");
    let customer = await Customer.findOne({ phone: cleanPhone });
    if (customer) {
      // Refund redeemed points
      if (order.pointsRedeemed > 0) {
        customer.loyaltyPoints += order.pointsRedeemed;
      }
      
      // Deduct points earned on this order
      const finalPaidAmount = Math.max(0, order.subtotal - order.loyaltyDiscount);
      const pointsEarned = Math.floor(finalPaidAmount / 10);
      customer.loyaltyPoints = Math.max(0, customer.loyaltyPoints - pointsEarned);

      await customer.save();
      console.log(`[ORDER CANCELLED] Customer ${cleanPhone}: Refunded ${order.pointsRedeemed} pts, Deducted ${pointsEarned} pts. New Balance: ${customer.loyaltyPoints}`);
    }

    // 3. Mark status as Cancelled
    order.status = 'Cancelled';
    order.cancelReason = reason || 'Customer request';
    await order.save();
    const operator = req.headers['x-operator'] || "System";
    await logAudit("ORDER_CANCEL", `Cancelled order SC-${order.orderId}. Reason: '${order.cancelReason}'.`, operator);
    res.json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// 4. DELETE order
app.delete('/api/orders/:id', async (req, res) => {
  try {
    const deleted = await Order.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Order not found' });
    const operator = req.headers['x-operator'] || "System";
    await logAudit("ORDER_DELETE", `Deleted order record for SC-${deleted.orderId}.`, operator);
    res.json({ success: true, deletedId: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// --- REVIEWS ROUTES ---

// 1. GET all reviews
app.get('/api/reviews', async (req, res) => {
  try {
    const list = await Review.find({}).sort({ _id: -1 });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. POST submit review
app.post('/api/reviews', async (req, res) => {
  try {
    const newReview = new Review(req.body);
    await newReview.save();
    const operator = req.headers['x-operator'] || "System";
    await logAudit("REVIEW_CREATE", `Customer ${newReview.customerName || 'Guest'} submitted review (ID: ${newReview.reviewId}) for product '${newReview.productName}' with rating ${newReview.rating}⭐.`, operator);
    res.status(201).json(newReview);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3. PUT approve review
app.put('/api/reviews/:id/approve', async (req, res) => {
  try {
    const updated = await Review.findByIdAndUpdate(
      req.params.id,
      { approved: true },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Review not found' });
    const operator = req.headers['x-operator'] || "System";
    await logAudit("REVIEW_APPROVE", `Approved customer review (ID: ${updated.reviewId}) for product '${updated.productName}'.`, operator);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 4. DELETE review
app.delete('/api/reviews/:id', async (req, res) => {
  try {
    const deleted = await Review.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Review not found' });
    const operator = req.headers['x-operator'] || "System";
    await logAudit("REVIEW_DELETE", `Deleted customer review (ID: ${deleted.reviewId}) for product '${deleted.productName}'.`, operator);
    res.json({ success: true, deletedId: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// --- EXCHANGES ROUTES ---

// 1. GET all exchanges
app.get('/api/exchanges', async (req, res) => {
  try {
    const list = await Exchange.find({}).sort({ _id: -1 });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. POST submit exchange request
app.post('/api/exchanges', async (req, res) => {
  try {
    const newExchange = new Exchange(req.body);
    await newExchange.save();
    const operator = req.headers['x-operator'] || "System";
    await logAudit("EXCHANGE_REQUEST", `Customer requested exchange for product '${newExchange.productName}' in order SC-${newExchange.orderId}. Reason: '${newExchange.reason}'.`, operator);
    res.status(201).json(newExchange);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3. PUT approve/reject exchange status
app.put('/api/exchanges/:id/status', async (req, res) => {
  try {
    const { status, feedback } = req.body;
    
    const exchange = await Exchange.findOne({ exchangeId: req.params.id });
    if (!exchange) return res.status(404).json({ error: 'Exchange request not found' });
    
    if (exchange.updateCount >= 2) {
      return res.status(400).json({ error: 'Maximum status update limit (2 times) reached for this exchange request.' });
    }
    
    exchange.status = status;
    exchange.updateCount = (exchange.updateCount || 0) + 1;
    if (status === 'Rejected') {
      exchange.adminFeedback = feedback || '';
    } else {
      exchange.adminFeedback = ''; // Clear if approved
    }
    
    await exchange.save();
    
    // Update matching order status
    await Order.findOneAndUpdate(
      { orderId: exchange.orderId },
      { status: `Exchange ${status}` }
    );

    const operator = req.headers['x-operator'] || "System";
    await logAudit("EXCHANGE_DECISION", `Exchange status of order SC-${exchange.orderId} updated to '${status}'. Admin feedback: '${exchange.adminFeedback || 'None'}'.`, operator);
    res.json(exchange);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- AUDIT LOGS ROUTES ---
app.get('/api/audit-logs', async (req, res) => {
  try {
    const list = await AuditLog.find({}).sort({ timestamp: -1 }).limit(100);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- DYNAMIC BANNER MANAGEMENT ROUTES ---

// 1. GET all banners (both active and inactive for admin)
app.get('/api/banners', async (req, res) => {
  try {
    const banners = await Banner.find().sort({ order: 1 });
    res.json(banners);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. GET active banners for storefront
app.get('/api/banners/active', async (req, res) => {
  try {
    const active = await Banner.find({ isActive: true }).sort({ order: 1 });
    res.json(active);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. POST create a new banner
app.post('/api/banners', async (req, res) => {
  try {
    const newBanner = new Banner(req.body);
    await newBanner.save();
    const operator = req.headers['x-operator'] || "System";
    await logAudit("BANNER_CREATE", `Created new banner '${newBanner.title}'.`, operator);
    res.status(201).json(newBanner);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 4. PUT update a banner
app.put('/api/banners/:id', async (req, res) => {
  try {
    const original = await Banner.findById(req.params.id);
    if (!original) return res.status(404).json({ error: 'Banner not found' });
    
    const updated = await Banner.findByIdAndUpdate(req.params.id, req.body, { new: true });
    const operator = req.headers['x-operator'] || "System";
    await logAudit("BANNER_UPDATE", `Updated banner '${updated.title}'.`, operator);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5. DELETE a banner
app.delete('/api/banners/:id', async (req, res) => {
  try {
    const original = await Banner.findById(req.params.id);
    if (!original) return res.status(404).json({ error: 'Banner not found' });
    
    await Banner.findByIdAndDelete(req.params.id);
    const operator = req.headers['x-operator'] || "System";
    await logAudit("BANNER_DELETE", `Deleted banner '${original.title}'.`, operator);
    res.json({ message: "Banner deleted successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- OUTFIT BUNDLE MANAGEMENT ROUTES ---

// 1. GET all bundles
app.get('/api/bundles', async (req, res) => {
  try {
    const list = await Bundle.find({}).populate('productA').populate('productB');
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. POST create a bundle
app.post('/api/bundles', async (req, res) => {
  try {
    const newBundle = new Bundle(req.body);
    await newBundle.save();
    const operator = req.headers['x-operator'] || "System";
    await logAudit("BUNDLE_CREATE", `Created new outfit bundle '${newBundle.title}' at price ₹${newBundle.price}.`, operator);
    const populated = await Bundle.findById(newBundle._id).populate('productA').populate('productB');
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3. PUT edit/update an existing bundle
app.put('/api/bundles/:id', async (req, res) => {
  try {
    const original = await Bundle.findById(req.params.id);
    if (!original) return res.status(404).json({ error: 'Outfit bundle not found' });

    const updated = await Bundle.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('productA').populate('productB');
    const operator = req.headers['x-operator'] || "System";
    await logAudit("BUNDLE_UPDATE", `Updated outfit bundle '${updated.title}' to price ₹${updated.price}.`, operator);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 4. DELETE an outfit bundle
app.delete('/api/bundles/:id', async (req, res) => {
  try {
    const deleted = await Bundle.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Outfit bundle not found' });
    const operator = req.headers['x-operator'] || "System";
    await logAudit("BUNDLE_DELETE", `Deleted outfit bundle '${deleted.title}'.`, operator);
    res.json({ success: true, message: "Outfit bundle deleted successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. GET global bundle settings
app.get('/api/bundles/settings', async (req, res) => {
  try {
    let settings = await BundleSettings.findOne({ key: "bundle_settings" });
    if (!settings) {
      settings = new BundleSettings({
        key: "bundle_settings",
        mixMatchDiscount: 15,
        aiDiscount: 20
      });
      await settings.save();
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. POST update global bundle settings
app.post('/api/bundles/settings', async (req, res) => {
  try {
    const { mixMatchDiscount, aiDiscount } = req.body;
    let settings = await BundleSettings.findOne({ key: "bundle_settings" });
    if (!settings) {
      settings = new BundleSettings({ key: "bundle_settings" });
    }

    settings.mixMatchDiscount = (mixMatchDiscount !== undefined) ? parseInt(mixMatchDiscount) || 0 : 15;
    settings.aiDiscount = (aiDiscount !== undefined) ? parseInt(aiDiscount) || 0 : 20;

    await settings.save();

    const operator = req.headers['x-operator'] || "System";
    await logAudit("BUNDLE_SETTINGS_UPDATE", `Updated Outfit Bundle Settings: Mix & Match Discount = ${settings.mixMatchDiscount}%, AI Discount = ${settings.aiDiscount}%.`, operator);

    res.json(settings);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================================================
// DYNAMIC QR CODE GENERATION ENDPOINTS
// ==========================================================================

// 1. GET UPI Payment QR Code
app.get('/api/qr/upi', async (req, res) => {
  try {
    const { amount } = req.query;
    if (!amount) {
      return res.status(400).json({ error: "Amount query parameter is required" });
    }
    const parsedAmount = parseFloat(amount).toFixed(2);
    const merchantName = process.env.MERCHANT_NAME || "Sushant Singh";
    const upiId = process.env.UPI_ID || "sshushant074@oksbi";

    
    // Construct standard UPI intent link
    // upi://pay?pa=address&pn=name&am=amount&cu=INR&tn=message
    const upiString = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(merchantName)}&am=${parsedAmount}&cu=INR&tn=${encodeURIComponent("Smart Collection Payment")}`;
    
    // Generate QR base64 image
    const qrDataUrl = await QRCode.toDataURL(upiString, {
      color: {
        dark: '#0f172a',  // deep primary dark
        light: '#ffffff'  // white background
      },
      width: 300,
      margin: 2
    });
    
    res.json({
      success: true,
      qr: qrDataUrl,
      upiString: upiString,
      upiId: upiId,
      merchantName: merchantName,
      amount: parsedAmount
    });
  } catch (err) {
    console.error("Failed to generate UPI QR code:", err);
    res.status(500).json({ error: err.message });
  }
});

// 2. GET Product Share QR Code
app.get('/api/qr/product/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    const host = req.get('host');
    const protocol = req.protocol;
    
    // Resolve share URL dynamically
    const shareLink = `${protocol}://${host}/index.html?p=${productId}`;
    
    // Generate QR code for the link
    const qrDataUrl = await QRCode.toDataURL(shareLink, {
      color: {
        dark: '#1e1b4b',  // deep indigo
        light: '#ffffff'
      },
      width: 250,
      margin: 2
    });
    
    res.json({
      success: true,
      qr: qrDataUrl,
      shareLink: shareLink
    });
  } catch (err) {
    console.error("Failed to generate Product QR code:", err);
    res.status(500).json({ error: err.message });
  }
});

// Fallback HTML router
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start listening
app.listen(PORT, () => {
  console.log(`🚀 Smart Collection backend server is active at http://localhost:${PORT}`);
});
