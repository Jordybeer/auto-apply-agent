import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import * as cheerio from 'cheerio';

export const maxDuration = 60; 

export async function POST() {
  try {
    const jobsToInsert: any[] = [];
    const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || '4447432b28df86c056b46dcb7f90d948';
    
    if (!SCRAPER_API_KEY) {
      return NextResponse.json({ success: false, error: "Missing SCRAPER_API_KEY in environment variables." }, { status: 400 });
    }

    const fetchViaProxy = async (targetUrl: string) => {
      const proxyUrl = `https://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(targetUrl)}&premium=true`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      
      try {
        const res = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        return res;
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }
    };

    // Huge expansion of specific Internal IT / Helpdesk queries
    const targetUrls = [
      { url: 'https://www.jobat.be/nl/zoeken?q=IT%20Support&l=Antwerpen&radius=20', source: 'jobat' },
      { url: 'https://www.jobat.be/nl/zoeken?q=Helpdesk&l=Antwerpen&radius=20', source: 'jobat' },
      { url: 'https://www.jobat.be/nl/zoeken?q=Service%20Desk&l=Antwerpen&radius=20', source: 'jobat' },
      { url: 'https://www.jobat.be/nl/zoeken?q=ICT%20Medewerker&l=Antwerpen&radius=20', source: 'jobat' },
      { url: 'https://www.jobat.be/nl/zoeken?q=1st%20Line&l=Antwerpen&radius=20', source: 'jobat' },
      { url: 'https://www.stepstone.be/jobs/it-support/in-antwerpen', source: 'stepstone' },
      { url: 'https://www.stepstone.be/jobs/helpdesk/in-antwerpen', source: 'stepstone' },
      { url: 'https://www.stepstone.be/jobs/service-desk/in-antwerpen', source: 'stepstone' },
      { url: 'https://www.stepstone.be/jobs/ict/in-antwerpen', source: 'stepstone' },
      { url: 'https://www.ictjob.be/nl/it-vacatures-zoeken?keywords=Support&location=Antwerpen', source: 'ictjob' },
      { url: 'https://www.ictjob.be/nl/it-vacatures-zoeken?keywords=Helpdesk&location=Antwerpen', source: 'ictjob' }
    ];

    const results = [];
    
    // Batch requests in groups of 3 to avoid hitting ScraperAPI concurrency limits
    for (let i = 0; i < targetUrls.length; i += 3) {
      const batch = targetUrls.slice(i, i + 3);
      const batchPromises = batch.map(target => 
        fetchViaProxy(target.url)
          .then(async (res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const html = await res.text();
            return { html, source: target.source };
          })
          .catch(err => {
            console.error(`Failed fetching ${target.url}:`, err.message);
            return { html: '', source: target.source, error: true };
          })
      );
      const batchResults = await Promise.allSettled(batchPromises);
      results.push(...batchResults);
    }

    for (const result of results) {
      if (result.status === 'fulfilled' && !('error' in result.value)) {
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
            
            if (title && urlPart) {
              const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.stepstone.be${urlPart}`;
              jobsToInsert.push({
                source_id: `stepstone-${Buffer.from(fullUrl).toString('base64').substring(0, 15)}`,
                title, company, url: fullUrl, description, source
              });
            }
          });
        } else if (source === 'ictjob') {
          $('.search-item').each((i, el) => {
            const titleNode = $(el).find('.job-title');
            const title = titleNode.text().trim();
            const urlPart = titleNode.attr('href') || '';
            const company = $(el).find('.job-company').text().trim() || 'Onbekend';
            const description = $(el).find('.job-keywords').text().trim() || '';
            
            if (title && urlPart) {
              const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.ictjob.be${urlPart}`;
              jobsToInsert.push({
                source_id: `ictjob-${Buffer.from(fullUrl).toString('base64').substring(0, 15)}`,
                title, company, url: fullUrl, description, source
              });
            }
          });
        }
      }
    }

    const uniqueJobs = Array.from(new Map(jobsToInsert.map(item => [item.source_id, item])).values());

    if (uniqueJobs.length === 0) {
       return NextResponse.json({ 
         success: true, 
         count: 0, 
         message: "Scraped 0 jobs. Geen nieuwe vacatures gevonden voor deze criteria." 
       });
    }

    const { data, error } = await supabase
      .from('jobs')
      .upsert(uniqueJobs, { onConflict: 'source_id', ignoreDuplicates: true })
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, count: data ? data.length : 0, total_found: uniqueJobs.length });
  } catch (error: any) {
    console.error("Scraping error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}