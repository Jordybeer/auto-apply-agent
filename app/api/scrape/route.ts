import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import * as cheerio from 'cheerio';

export async function POST() {
  try {
    const jobsToInsert: any[] = [];
    const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || '4447432b28df86c056b46dcb7f90d948';
    
    // Function to wrap target URLs in the ScraperAPI proxy
    const fetchViaProxy = async (targetUrl: string) => {
      const proxyUrl = `https://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(targetUrl)}&render=true`;
      return await fetch(proxyUrl);
    };

    // 1. Jobat.be (via Proxy)
    const jobatUrls = [
      'https://www.jobat.be/nl/zoeken?q=IT%20Support&l=Antwerpen',
      'https://www.jobat.be/nl/zoeken?q=Helpdesk&l=Antwerpen'
    ];

    for (const url of jobatUrls) {
      try {
        const response = await fetchViaProxy(url);
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
              const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.jobat.be${urlPart}`;
              jobsToInsert.push({
                source_id: `jobat-${Buffer.from(fullUrl).toString('base64').substring(0, 15)}`,
                title, company, url: fullUrl, description, source: 'jobat'
              });
            }
          });
        }
      } catch (e) {
        console.error(`Jobat fetch failed for ${url}`, e);
      }
    }

    // 2. StepStone.be (via Proxy)
    try {
      const stepstoneUrl = 'https://www.stepstone.be/jobs/in-antwerpen?q=IT-Support';
      const ssRes = await fetchViaProxy(stepstoneUrl);
      if (ssRes.ok) {
        const html = await ssRes.text();
        const $ = cheerio.load(html);
        
        $('article[data-qa="result-item"]').each((i, el) => {
          const title = $(el).find('h2').text().trim();
          const company = $(el).find('span[data-qa="job-company-name"]').text().trim();
          const urlPart = $(el).find('a[data-qa="job-title"]').attr('href');
          const description = $(el).find('span[data-qa="job-snippet"]').text().trim();
          
          if (title && urlPart) {
            const fullUrl = urlPart.startsWith('http') ? urlPart : `https://www.stepstone.be${urlPart}`;
            jobsToInsert.push({
              source_id: `stepstone-${Buffer.from(fullUrl).toString('base64').substring(0, 15)}`,
              title, company, url: fullUrl, description, source: 'stepstone'
            });
          }
        });
      }
    } catch (e) {
      console.error("Stepstone scrape failed", e);
    }

    // Deduplicate
    const uniqueJobs = Array.from(new Map(jobsToInsert.map(item => [item.source_id, item])).values());

    if (uniqueJobs.length === 0) {
       return NextResponse.json({ 
         success: true, 
         count: 0, 
         message: "Scraped 0 jobs. Proxy might be blocked or HTML selectors changed." 
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