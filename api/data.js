const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

export default async function handler(req, res) {
  try {
    await client.connect();
    const db = client.db('alkey_db');
    const collection = db.collection('app_data');

    if (req.method === 'GET') {
      const data = await collection.findOne({ id: "main_storage" });
      res.status(200).json(data || {});
    } else if (req.method === 'POST') {
      const newData = req.body;
      await collection.updateOne(
        { id: "main_storage" },
        { $set: newData },
        { upsert: true }
      );
      res.status(200).json({ success: true });
    }
  } catch (error) {
    res.status(500).json({ error: 'Database connection failed' });
  } finally {
    await client.close();
  }
}
