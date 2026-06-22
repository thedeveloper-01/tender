import React from 'react';
import { renderToString } from 'react-dom/server';
import TenderDashboard from './src/components/TenderDashboard.jsx';

const mockTenders = [
  {
    id: '1',
    bidNumber: 'GEM/2026/B/7603635',
    title: 'Test BOQ Bid',
    source: 'GEM',
    endDate: '2026-06-22T10:00:00.000Z',
    locationCity: 'Raipur',
    bidValue: 100000,
    category: ['General']
  }
];

try {
  console.log('Rendering TenderDashboard...');
  const html = renderToString(
    React.createElement(TenderDashboard, {
      initialSource: 'all',
      initialCity: 'all',
      initialTenders: mockTenders,
      initialTotal: 1
    })
  );
  console.log('SSR Success! HTML Length:', html.length);
  console.log('HTML Output contains Test BOQ Bid:', html.includes('Test BOQ Bid'));
  console.log('HTML Output contains Skeleton:', html.includes('animate-pulse'));
} catch (e) {
  console.error('SSR Failure:', e);
}
