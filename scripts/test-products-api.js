/**
 * Test script to diagnose product API issues
 * Run with: node scripts/test-products-api.js
 */

const axios = require('axios');
require('dotenv').config({ path: '.env.local' });

const API_URL = process.env.NEXT_PUBLIC_WC_API_URL;
const CONSUMER_KEY = process.env.NEXT_PUBLIC_WC_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.NEXT_PUBLIC_WC_CONSUMER_SECRET;

console.log('Testing WooCommerce API Configuration...\n');
console.log('API URL:', API_URL || 'NOT SET');
console.log('Consumer Key:', CONSUMER_KEY ? `${CONSUMER_KEY.substring(0, 10)}...` : 'NOT SET');
console.log('Consumer Secret:', CONSUMER_SECRET ? 'SET' : 'NOT SET');
console.log('');

if (!API_URL || !CONSUMER_KEY || !CONSUMER_SECRET) {
  console.error('❌ Missing required environment variables!');
  console.error('Please check your .env.local file.');
  process.exit(1);
}

const wcAPI = axios.create({
  baseURL: API_URL,
  auth: {
    username: CONSUMER_KEY,
    password: CONSUMER_SECRET,
  },
  timeout: 30000,
  params: {
    consumer_key: CONSUMER_KEY,
    consumer_secret: CONSUMER_SECRET,
  },
});

async function testProducts() {
  try {
    console.log('Testing products endpoint...');
    const response = await wcAPI.get('/products', {
      params: {
        per_page: 5,
      },
    });
    
    console.log('✅ Products API is working!');
    console.log(`Found ${response.data?.length || 0} products`);
    console.log('Sample product:', response.data?.[0]?.name || 'N/A');
    return true;
  } catch (error) {
    console.error('❌ Products API failed!');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Error:', error.response.data);
    } else if (error.request) {
      console.error('No response received. Check network connection and API URL.');
    } else {
      console.error('Error:', error.message);
    }
    return false;
  }
}

async function testCategories() {
  try {
    console.log('\nTesting categories endpoint...');
    const response = await wcAPI.get('/products/categories', {
      params: {
        per_page: 5,
      },
    });
    
    console.log('✅ Categories API is working!');
    console.log(`Found ${response.data?.length || 0} categories`);
    return true;
  } catch (error) {
    console.error('❌ Categories API failed!');
    console.error('Error:', error.response?.data || error.message);
    return false;
  }
}

async function runTests() {
  const productsOk = await testProducts();
  const categoriesOk = await testCategories();
  
  console.log('\n' + '='.repeat(50));
  if (productsOk && categoriesOk) {
    console.log('✅ All tests passed! API is configured correctly.');
    console.log('\nIf products still don\'t show on homepage:');
    console.log('1. Check browser console for errors');
    console.log('2. Verify products exist in WooCommerce');
    console.log('3. Check server logs for fetch errors');
  } else {
    console.log('❌ Some tests failed. Please fix API configuration.');
  }
}

runTests();

