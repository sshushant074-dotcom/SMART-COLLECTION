const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const dns = require('dns');
if (process.env.MONGODB_URI && process.env.MONGODB_URI.startsWith('mongodb+srv')) {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
    dns.setDefaultResultOrder('ipv4first');
  } catch (err) {
    console.warn('⚠️ Failed to set custom DNS servers:', err.message);
  }
}


// MONGODB URI Config
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart_collection';

async function runBackup() {
  console.log(`💾 [Backup Tool] Initiating database backup process at ${new Date().toISOString()}...`);
  
  // Establish connection if not already connected
  if (mongoose.connection.readyState === 0) {
    try {
      await mongoose.connect(MONGODB_URI);
      console.log('💾 [Backup Tool] Connected to MongoDB database.');
    } catch (err) {
      console.error('💾 [Backup Tool] Database connection failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  try {
    // Define backup directory
    const backupsBaseDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupsBaseDir)) {
      fs.mkdirSync(backupsBaseDir, { recursive: true });
    }

    // Create a unique timestamped subfolder
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(backupsBaseDir, `backup_${timestamp}`);
    fs.mkdirSync(backupDir);

    // Get list of native database collections
    const collections = await mongoose.connection.db.collections();
    console.log(`💾 [Backup Tool] Found ${collections.length} database collections to back up.`);

    const report = {};

    for (const col of collections) {
      const collectionName = col.collectionName;
      
      // Skip system collections if any
      if (collectionName.startsWith('system.')) continue;
      
      console.log(`   └─ Exporting collection '${collectionName}'...`);
      const documents = await col.find({}).toArray();
      
      const filePath = path.join(backupDir, `${collectionName}.json`);
      fs.writeFileSync(filePath, JSON.stringify(documents, null, 2), 'utf8');
      
      console.log(`      └─ Saved ${documents.length} records to ${collectionName}.json`);
      report[collectionName] = documents.length;
    }

    // Write a meta file
    const metaPath = path.join(backupDir, 'meta.json');
    const metaData = {
      timestamp: new Date().toISOString(),
      collectionsBackupCount: Object.keys(report).length,
      collectionStats: report
    };
    fs.writeFileSync(metaPath, JSON.stringify(metaData, null, 2), 'utf8');

    console.log(`✅ [Backup Tool] Backup successfully completed! Stored under: ${backupDir}`);
    return { success: true, path: backupDir, stats: report };
  } catch (err) {
    console.error('❌ [Backup Tool] Backup failed with error:', err.message);
    return { success: false, error: err.message };
  } finally {
    // Don't close connection if this runs inside the active Express server context
    // but if it's called as standalone command line script, disconnect
    if (require.main === module) {
      await mongoose.disconnect();
      console.log('💾 [Backup Tool] Disconnected from MongoDB.');
    }
  }
}

// Support executing directly from terminal: "node backup.js"
if (require.main === module) {
  runBackup();
}

module.exports = { runBackup };
