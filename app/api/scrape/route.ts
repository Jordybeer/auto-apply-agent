import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import * as cheerio from 'cheerio';

export const maxDuration = 60; 

export async function POST() {
  try {
    const jobsToInsert: any[] = [];
    const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;
    
    if (!SCRAPER_API_KEY) {
      return NextResponse.json({ success: false, error: "Missing SCRAPER_API_KEY in environment variables." }, { status: 400 });
    }

    const fetchViaProxy = async (targetUrl: string) => {
      // Removed render=true. Headless browsing takes up to 30-40 seconds per request,
      // which causes Vercel 504 timeouts. Jobat and Stepstone SEO cards are usually in raw HTML anyway.
      // Added premium=true to use residential IPs which is faster than rendering.
      const proxyUrl = `https://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(targetUrl)}&premium=true`;
      
      // Force timeout after 45 seconds so Vercel doesn't kill it blindly
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);
      
      try {
        const res = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        return res;
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }
    };

    const targetUrls = [
      { url: 'https://www.jobat.be/nl/zoeken?q=IT%20Support&l=Antwerpen', source: 'jobat' },
      { url: 'https://www.jobat.be/nl/zoeken?q=Helpdesk&l=Antwerpen', source: 'jobat' },
      { url: 'https://www.stepstone.be/jobs/it-support/in-antwerpen', source: 'stepstone' }
    ];

    const fetchPromises = targetUrls.map(target => 
      fetchViaProxy(target.url).then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        return { html, source: target.source };
      })
    );

    const results = await Promise.allSettled(fetchPromises);

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { html, source } = result.value;
        const $ = cheerio.load(html);

        if (source === 'jobat') {
          $('.job-item').each((i, el) => {
            const titleNode = $(el).find('.job-item__title a');
            const title = titleNode.text().trim();
            const urlPart = titleNode.attr('href') || '';
            const company = $(el).find('.job-item__company').text().trim() || 'Onbekend';
            const description = $(el).find('.job-item__description').text().trim() || '';
            
            if (title && urlPart) {
              const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.jobat.be${urlPart}`;
              jobsToInsert.push({
                source_id: `jobat-${Buffer.from(fullUrl).toString('base64').substring(0, 15)}`,
                title, company, url: fullUrl, description, source
              });
            }
          });
        } else if (source === 'stepstone') {
          $('article').each((i, el) => {
            const title = $(el).find('h2').text().trim();
            const company = $(el).find('[data-qa="job-company-name"], .res-11j246r').text().trim() || 'Onbekend';
            const urlPart = $(el).find('a').attr('href');
            const description = $(el).find('[data-qa="job-snippet"], .res-1a22uog').text().trim() || '';
            
            if (title && urlPart && title.toLowerCase().includes('support')) {
              const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.stepstone.be${urlPart}`;
              jobsToInsert.push({
                source_id: `stepstone-${Buffer.from(fullUrl).toString('base64').substring(0, 15)}`,
                title, company, url: fullUrl, description, source
              });
            }
          });
        }
      } else {
        console.error("One of the scraping promises failed:", result.reason);
      }
    }

    const uniqueJobs = Array.from(new Map(jobsToInsert.map(item => [item.source_id, item])).values());

    if (uniqueJobs.length === 0) {
       return NextResponse.json({ 
         success: true, 
         count: 0, 
         message: "Scraped 0 jobs. The proxy successfully connected but found no jobs matching the selectors." 
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