import React from 'react';
import OfflineBookingsView from '../components/OfflineBookingsView';

export const OfflineBookingsPage: React.FC = () => (
  <div className="space-y-8 animate-in fade-in duration-200">
    <div>
      <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1B1B1B] tracking-tight">
        Offline course bookings
      </h1>
      <p className="text-sm text-[#6B7280] mt-1">
        Choose a scheduled session, reserve an available seat, or join its waitlist when it’s full.
      </p>
    </div>
    <OfflineBookingsView />
  </div>
);
