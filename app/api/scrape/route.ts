import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import * as cheerio from 'cheerio';

export async function POST() {
  try {
    const jobsToInsert: any[] = [];
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    // Broadened Jobat Scrape: Searching whole of Belgium for IT Support to ensure we catch results
    try {
      const jobatUrl = 'https://www.jobat.be/nl/vacatures/it-support';
      const jobatRes = await fetch(jobatUrl, { headers: { 'User-Agent': userAgent } });
      
      if (jobatRes.ok) {
        const html = await jobatRes.text();
        const $ = cheerio.load(html);
        
        $('.job-item').each((i, el) => {
          const titleNode = $(el).find('.job-item__title a');
          const title = titleNode.text().trim();
          const urlPart = titleNode.attr('href') || '';
          const company = $(el).find('.job-item__company').text().trim() || 'Onbekend';
          const description = $(el).find('.job-item__description').text().trim() || '';
          
          if (title && urlPart) {
            const url = urlPart.startsWith('http') ? urlPart : `https://www.jobat.be${urlPart}`;
            jobsToInsert.push({
              source_id: `jobat-${Buffer.from(url).toString('base64').substring(0, 15)}`,
              title, company, url, description, source: 'jobat'
            });
          }
        });
      } else {
        console.error(`Jobat HTTP Error: ${jobatRes.status} ${jobatRes.statusText}`);
      }
    } catch (e) { console.error("Jobat scrape failed", e); }

    // Check if we hit bot protection
    if (jobsToInsert.length === 0) {
       console.log("No jobs found across any target. Vercel IP might be blocked or selectors changed.");
       return NextResponse.json({ success: true, count: 0, message: "Scraped 0 jobs. Sites might be blocking Vercel's IP address." });
    }

    const { data, error } = await supabase
      .from('jobs')
      .upsert(jobsToInsert, { onConflict: 'source_id' })
      .select();

    if (error) {
      console.error("Supabase insert error:", error);
      throw error;
    }

    return NextResponse.json({ success: true, count: data.length, jobs: data });
  } catch (error: any) {
    console.error("Scraping error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}