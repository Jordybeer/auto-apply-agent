import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import * as cheerio from 'cheerio';

export async function POST() {
  try {
    const jobsToInsert: any[] = [];
    
    // Scrape Jobat for IT Support roles in Antwerp
    // This is a live URL matching your profile
    const targetUrl = 'https://www.jobat.be/nl/vacatures/it-support/antwerpen';
    
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (response.ok) {
      const html = await response.text();
      const $ = cheerio.load(html);

      // Parse Jobat's specific HTML structure for job cards
      $('.job-item').each((i, el) => {
        const titleNode = $(el).find('.job-item__title a');
        const title = titleNode.text().trim() || 'Onbekende Titel';
        const urlPart = titleNode.attr('href') || '';
        
        const companyNode = $(el).find('.job-item__company');
        const company = companyNode.text().trim() || 'Onbekend Bedrijf';
        
        const descNode = $(el).find('.job-item__description');
        const description = descNode.text().trim() || 'Geen beschrijving beschikbaar.';
        
        // Fix for the previous template literal error
        const url = urlPart.startsWith('http') ? urlPart : `https://www.jobat.be${urlPart}`;
        
        // Generate a unique ID based on URL
        const source_id = `jobat-${Buffer.from(url).toString('base64').substring(0, 15)}`;

        if (urlPart) {
          jobsToInsert.push({
            source_id,
            title,
            company,
            url,
            description,
            source: 'jobat'
          });
        }
      });
    } else {
      console.error("Jobat returned status:", response.status);
      // Fallback dummy data if scraping fails (so you can still test the flow)
      jobsToInsert.push({
        source_id: `fallback-${Date.now()}`,
        title: "1st/2nd Line IT Support Engineer",
        company: "Zorgnet Vlaanderen",
        url: "https://example.com",
        description: "Wij zoeken een IT Support Engineer met kennis van SQL en ticketing systemen (Jira) om onze zorgverleners te ondersteunen. Je bent empathisch, stressbestendig en spreekt vlot Nederlands en Frans.",
        source: "fallback"
      });
    }

    if (jobsToInsert.length === 0) {
       return NextResponse.json({ success: true, count: 0, message: "No jobs found or blocked by bot protection." });
    }

    const { data, error } = await supabase
      .from('jobs')
      .upsert(jobsToInsert, { onConflict: 'source_id' })
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, count: data.length, jobs: data });
  } catch (error: any) {
    console.error("Scraping error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}