'use client';

import Link from 'next/link';
import Lottie from 'lottie-react';
import notFoundJson from '@/app/lotties/not-found.json';

export default function NotFound() {
  return (
    <main
      style={{
        margin: 0,
        padding: 0,
        background: '#181828',
        minHeight: '100vh',
        overflow: 'hidden',
        fontFamily: "'Montserrat', sans-serif",
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Google Font */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700;900&display=swap');

        .star-layer {
          content: " ";
          position: absolute;
          background: transparent;
          animation: animStar linear infinite;
          pointer-events: none;
        }
        .starsec   { width: 3px; height: 3px; animation-duration: 150s; }
        .starthird { width: 3px; height: 3px; animation-duration: 10s; }
        .starfourth{ width: 2px; height: 2px; animation-duration: 50s; }
        .starfifth { width: 1px; height: 1px; animation-duration: 80s; }

        .starsec, .starthird, .starfourth, .starfifth {
          box-shadow:
            571px 173px #00BCD4, 1732px 143px #00BCD4, 1745px 454px #FF5722,
            234px 784px #00BCD4, 1793px 1123px #FF9800, 1076px 504px #03A9F4,
            633px 601px #FF5722, 350px 630px #FFEB3B, 1164px 782px #00BCD4,
            76px 690px #3F51B5, 1825px 701px #CDDC39, 1646px 578px #FFEB3B,
            544px 293px #2196F3, 445px 1061px #673AB7, 928px 47px #00BCD4,
            168px 1410px #8BC34A, 777px 782px #9C27B0, 1235px 941px #9C27B0,
            104px 690px #8BC34A, 1167px 338px #E91E63, 345px 652px #009688,
            1682px 596px #F44336, 1995px 494px #8BC34A, 428px 798px #FF5722,
            340px 623px #F44336, 605px 349px #9C27B0, 1339px 344px #673AB7,
            1102px 745px #3F51B5, 1592px 676px #2196F3, 419px 424px #FF9800,
            630px 333px #4CAF50, 1995px 644px #00BCD4, 340px 505px #FFF,
            1700px 39px #FFF, 228px 824px #FFF, 137px 397px #FFF,
            1807px 444px #FFF, 1972px 248px #FFF;
        }

        @keyframes animStar {
          0%   { transform: translateY(0px); }
          100% { transform: translateY(-2000px); }
        }

        /* Swinging lamp */
        .lamp__wrap { position: absolute; top: 0; left: 0; right: 0; max-height: 60vh; overflow: hidden; pointer-events: none; }
        .lamp {
          position: absolute;
          left: 0; right: 0; top: 0;
          margin: 0 auto;
          width: 300px;
          display: flex;
          flex-direction: column;
          align-items: center;
          transform-origin: center top;
          animation: move 5.1s cubic-bezier(0.6, 0, 0.38, 1) infinite;
        }
        @keyframes move {
          0%   { transform: rotate(40deg); }
          50%  { transform: rotate(-40deg); }
          100% { transform: rotate(40deg); }
        }
        .cable {
          width: 8px;
          height: 160px;
          background-image: linear-gradient(rgb(32 148 218 / 70%), rgb(193 65 25));
        }
        .cover {
          width: 140px; height: 55px;
          background: #0bd5e8;
          border-top-left-radius: 50%;
          border-top-right-radius: 50%;
          position: relative; z-index: 200;
        }
        .in-cover {
          width: 100%; max-width: 140px; height: 14px;
          border-radius: 100%;
          background: #08ffff;
          position: absolute; left: 0; right: 0; margin: 0 auto;
          bottom: -6px; z-index: 100;
        }
        .in-cover .bulb {
          width: 34px; height: 34px;
          background-color: #08fffa;
          border-radius: 50%;
          position: absolute; left: 0; right: 0; bottom: -14px; margin: 0 auto;
          box-shadow: 0 0 25px 7px rgb(127 255 255 / 80%), 0 0 64px 47px rgba(0,255,255,0.5), 0 0 30px 15px rgba(0,255,255,0.2);
        }
        .light {
          width: 140px; height: 0;
          border-bottom: 500px solid rgb(44 255 255 / 18%);
          border-left: 35px solid transparent;
          border-right: 35px solid transparent;
          position: absolute; left: 0; right: 0; top: 185px; margin: 0 auto;
          z-index: 1; border-radius: 60px 60px 0 0;
        }

        /* 404 content */
        .not-found-content {
          position: relative;
          z-index: 10;
          text-align: center;
          padding: 0 1.5rem;
        }
        .not-found-title {
          font-family: 'Montserrat', sans-serif;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 5px;
          font-size: clamp(2rem, 6vw, 5rem);
          color: #ffffff;
          line-height: 1.1;
          margin-bottom: 1rem;
        }
        .not-found-code {
          font-family: 'Montserrat', sans-serif;
          font-weight: 900;
          font-size: clamp(5rem, 18vw, 10rem);
          color: #0bd5e8;
          line-height: 1;
          text-shadow: 0 0 40px rgba(11,213,232,0.5);
          letter-spacing: 0.05em;
          margin-bottom: 0.5rem;
        }
        .not-found-text {
          font-family: 'Montserrat', sans-serif;
          font-size: clamp(0.875rem, 2vw, 1rem);
          color: rgba(255,255,255,0.6);
          line-height: 1.8;
          max-width: 480px;
          margin: 0 auto 2.5rem;
        }
        .not-found-btn {
          display: inline-block;
          padding: 0.75rem 2rem;
          border: 1px solid #0bd5e8;
          color: #0bd5e8;
          font-family: 'Montserrat', sans-serif;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          text-decoration: none;
          position: relative;
          overflow: hidden;
          transition: color 0.3s;
        }
        .not-found-btn::before {
          content: '';
          position: absolute;
          top: 80px; right: 80px;
          width: 260px; height: 200px;
          background: #0bd5e8;
          transform: rotate(50deg);
          transition: all 0.3s;
        }
        .not-found-btn:hover::before { top: -60px; right: -50px; }
        .not-found-btn:hover { color: #181828; }
        .not-found-btn span { position: relative; z-index: 1; }

        .lottie-wrap {
          width: clamp(160px, 35vw, 260px);
          margin: 0 auto 1rem;
          filter: drop-shadow(0 0 20px rgba(11,213,232,0.3));
        }
      `}</style>

      {/* Dust / star particles */}
      <div className="star-layer starsec"   aria-hidden="true" />
      <div className="star-layer starthird" aria-hidden="true" />
      <div className="star-layer starfourth" aria-hidden="true" />
      <div className="star-layer starfifth" aria-hidden="true" />

      {/* Swinging lamp */}
      <div className="lamp__wrap" aria-hidden="true">
        <div className="lamp">
          <div className="cable" />
          <div className="cover">
            <div className="in-cover">
              <div className="bulb" />
            </div>
          </div>
          <div className="light" />
        </div>
      </div>

      {/* Main content */}
      <div className="not-found-content">
        <div className="lottie-wrap">
          <Lottie animationData={notFoundJson} loop autoplay />
        </div>

        <p className="not-found-code" aria-label="Error 404">404</p>
        <h1 className="not-found-title">Page Not Found</h1>
        <p className="not-found-text">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
          The link you followed may be broken or no longer available.
        </p>

        <Link href="/" className="not-found-btn">
          <span>Go Home</span>
        </Link>
      </div>
    </main>
  );
}
