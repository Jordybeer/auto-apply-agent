import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import * as cheerio from 'cheerio';

export async function POST() {
  try {
    const jobsToInsert: any[] = [];
    const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || '4447432b28df86c056b46dcb7f90d948';
    
    const fetchViaProxy = async (targetUrl: string) => {
      const proxyUrl = `https://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(targetUrl)}&render=true`;
      return await fetch(proxyUrl);
    };

    // 1. Jobat.be (Expanding to different cities to guarantee new jobs)
    const jobatUrls = [
      'https://www.jobat.be/nl/zoeken?q=IT%20Support&l=Antwerpen',
      'https://www.jobat.be/nl/zoeken?q=Helpdesk&l=Antwerpen',
      'https://www.jobat.be/nl/zoeken?q=IT%20Support&l=Mechelen', // Added Mechelen
      'https://www.jobat.be/nl/zoeken?q=Support%20Engineer&l=Vlaanderen' // Broader scope
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

    // 2. StepStone.be
    try {
      const stepstoneUrl = 'https://www.stepstone.be/jobs/it-support/in-antwerpen';
      const ssRes = await fetchViaProxy(stepstoneUrl);
      if (ssRes.ok) {
        const html = await ssRes.text();
        const $ = cheerio.load(html);
        
        $('article').each((i, el) => {
          const title = $(el).find('h2').text().trim();
          // Stepstone frequently changes data-qa tags, using fallback classes
          const company = $(el).find('[data-qa="job-company-name"], .res-11j246r').text().trim() || 'Onbekend';
          const urlPart = $(el).find('a').attr('href');
          const description = $(el).find('[data-qa="job-snippet"], .res-1a22uog').text().trim() || '';
          
          if (title && urlPart && title.toLowerCase().includes('support')) {
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
         message: "Scraped 0 jobs. ScraperAPI might be timing out, or the HTML structure changed." 
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