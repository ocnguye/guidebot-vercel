// scripts/build-embeddings.js
const fs = require('fs');
const path = require('path');
const { HfInference } = require('@huggingface/inference');

// Load environment variables from .env
require('dotenv').config({ path: '.env' });

async function generateEmbeddings() {
  console.log('Starting embeddings generation...');
  
  // Debug environment variables
  console.log('Environment variables check:');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('HF_TOKEN exists:', !!process.env.HF_TOKEN);
  console.log('GUIDEBOT_TOKEN exists:', !!process.env.GUIDEBOT_TOKEN);
  console.log('HUGGINGFACE_API_KEY exists:', !!process.env.HUGGINGFACE_API_KEY);
  
  const token = process.env.HF_TOKEN || process.env.GUIDEBOT_TOKEN || process.env.HUGGINGFACE_API_KEY;
  
  if (!token) {
    console.error('Available environment variables:', Object.keys(process.env).filter(key => 
      key.toLowerCase().includes('token') || key.toLowerCase().includes('hf') || key.toLowerCase().includes('guide')
    ));
    throw new Error('No Hugging Face token found. Please set GUIDEBOT_TOKEN environment variable.');
  }
  
  console.log('Token found, length:', token.length);

  const hf = new HfInference(token);
  
  // Read the JSONL file
  const filePath = path.join(__dirname, '..', 'IRReports_DEID.jsonl');
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Reports file not found: ${filePath}`);
  }
  
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
  console.log(`Found ${lines.length} reports to process`);
  
  const reports = [];
  
  for (let i = 0; i < lines.length; i++) {
    try {
      const obj = JSON.parse(lines[i]);
      const text = obj.ContentText || obj.text || '';
      
      if (!text.trim()) {
        console.log(`Skipping empty report ${i}`);
        continue;
      }
      
      console.log(`Processing report ${i + 1}/${lines.length}`);
      
      // Generate embedding
      const response = await hf.featureExtraction({
        model: 'sentence-transformers/all-MiniLM-L6-v2',
        inputs: text.trim()
      });
      
      const embedding = Array.isArray(response[0]) ? response[0] : response;
      
      reports.push({
        id: i,
        text: text.trim(),
        embedding: embedding
      });
      
      // Rate limiting - wait between requests
      if (i % 5 === 0 && i > 0) {
        console.log('Waiting to avoid rate limits...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
    } catch (error) {
      console.error(`Failed to process report ${i}:`, error.message);
      // Continue with next report
    }
  }
  
  // Save to public folder
  const outputPath = path.join(__dirname, '..', 'public', 'embeddings.json');
  fs.writeFileSync(outputPath, JSON.stringify(reports, null, 2));
  
  console.log(`Successfully generated embeddings for ${reports.length} reports`);
  console.log(`Saved to: ${outputPath}`);
}

generateEmbeddings().catch(error => {
  console.error('Failed to generate embeddings:', error);
  process.exit(1);
});