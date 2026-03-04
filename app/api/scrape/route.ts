import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import * as cheerio from 'cheerio';

export async function POST() {
  try {
    const jobsToInsert: any[] = [];
    
    // Scrape Jobat for IT Support jobs in Antwerp/Belgium
    // We use a generic query here: "it support" or "support engineer"
    const jobatUrl = 'https://www.jobat.be/nl/vacatures/it-support';
    
    // Note: Vercel serverless functions do not have a real browser. 
    // If Jobat blocks this with Cloudflare/bot-protection, you'll get a 403.
    // For V1 we try a standard fetch with user-agent spoofing.
    const response = await fetch(jobatUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'nl-BE,nl;q=0.9,en-US;q=0.8,en;q=0.7',
      }
    });

    if (response.ok) {
      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Jobat typical listing selector (this may need adjustment if their HTML changes)
      $('.job-item').each((i, element) => {
        if (i >= 5) return; // limit to 5 per scrape to avoid overload

        const titleNode = $(element).find('.job-title');
        const companyNode = $(element).find('.job-company');
        const linkNode = $(element).find('a.job-link');
        const descNode = $(element).find('.job-excerpt');

        const title = titleNode.text().trim() || 'Support Engineer';
        const company = companyNode.text().trim() || 'Onbekend Bedrijf';
        const urlPart = linkNode.attr('href') || '';
        const description = descNode.text().trim() || 'Geen beschrijving beschikbaar.';
        
        const url = urlPart.startsWith('http') ? urlPart : \`https://www.jobat.be\${urlPart}\`;
        
        // Generate a unique ID based on URL
        const source_id = \`jobat-\${Buffer.from(url).toString('base64').substring(0, 15)}\`;

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
        source_id: \`fallback-\${Date.now()}\`,
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