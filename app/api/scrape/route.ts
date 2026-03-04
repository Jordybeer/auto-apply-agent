import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import * as cheerio from 'cheerio';

export async function POST() {
  try {
    const jobsToInsert: any[] = [];
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    // Expanded search URLs specifically for Antwerp
    const targetUrls = [
      'https://www.jobat.be/nl/vacatures/it-support/antwerpen',
      'https://www.jobat.be/nl/vacatures/helpdesk/antwerpen',
      'https://www.jobat.be/nl/vacatures/system-engineer/antwerpen'
    ];

    for (const url of targetUrls) {
      try {
        // Option 1: Direct fetch (might be blocked by Vercel IP)
        // Option 2 (Future): If blocked, you can wrap the URL in a proxy like ScraperAPI or ZenRows:
        // const fetchUrl = `https://api.scraperapi.com?api_key=YOUR_KEY&url=${encodeURIComponent(url)}`;
        
        const response = await fetch(url, { headers: { 'User-Agent': userAgent } });
        
        if (response.ok) {
          const html = await response.text();
          const $ = cheerio.load(html);
          
          $('.job-item').each((i, el) => {
            const titleNode = $(el).find('.job-item__title a');
            const title = titleNode.text().trim();
            const urlPart = titleNode.attr('href') || '';
            const company = $(el).find('.job-item__company').text().trim() || 'Onbekend';
            const description = $(el).find('.job-item__description').text().trim() || '';
            
            if (title && urlPart) {
              const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.jobat.be${fullUrlPart}`;
              jobsToInsert.push({
                source_id: `jobat-${Buffer.from(fullUrl).toString('base64').substring(0, 15)}`,
                title, company, url: fullUrl, description, source: 'jobat'
              });
            }
          });
        }
      } catch (e) {
        console.error(`Failed to scrape ${url}`, e);
      }
    }

    // Deduplicate jobs in memory before inserting
    const uniqueJobs = Array.from(new Map(jobsToInsert.map(item => [item.source_id, item])).values());

    if (uniqueJobs.length === 0) {
       return NextResponse.json({ 
         success: true, 
         count: 0, 
         message: "Scraped 0 jobs. Jobat is likely blocking Vercel's datacenter IP. You will need a proxy service like ScraperAPI to bypass this." 
       });
    }

    const { data, error } = await supabase
      .from('jobs')
      .upsert(uniqueJobs, { onConflict: 'source_id' })
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, count: data.length, jobs: data });
  } catch (error: any) {
    console.error("Scraping error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}