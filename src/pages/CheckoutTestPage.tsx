import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

interface Order {
  id: string;
  courseId: string;
  courseTitle: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired';
  provider: string;
}

/** Stand-in for a payment provider's page while PAYMENT_PROVIDER=test. No real money moves. */
export const CheckoutTestPage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: order, isLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => (await api.get(`/api/payments/orders/${orderId}`)).data.order as Order,
    enabled: !!orderId,
  });

  const complete = async (outcome: 'paid' | 'failed' | 'cancelled' | 'expired') => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/payments/mock/${orderId}/complete`, { outcome });
      await queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['course', order?.courseId] });
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Payment could not be processed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAF9] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl p-6 border border-gray-100 shadow-md space-y-5">
        <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          Paymob demo — simulated payment. No money is charged and no card details are needed.
        </p>
        {isLoading || !order ? (
          <p className="text-sm text-gray-500">{isLoading ? 'Loading order...' : 'Order not found.'}</p>
        ) : (
          <>
            <div>
              <h1 className="text-lg font-black text-[#1B1B1B]">{order.courseTitle}</h1>
              <p className="text-2xl font-black text-[#2D6A4F] mt-1">
                {order.amount} {order.currency}
              </p>
            </div>
            {!['test','paymob_mock'].includes(order.provider) ? <p role="alert">This order does not use the demo provider.</p> : order.status === 'pending' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  onClick={() => complete('paid')}
                  disabled={busy}
                  className="flex-1 py-2.5 rounded-xl bg-[#2D6A4F] text-white text-sm font-bold disabled:opacity-60"
                >
                  Simulate successful payment
                </button>
                <button
                  onClick={() => complete('failed')}
                  disabled={busy}
                  className="px-4 py-2.5 rounded-xl border border-red-200 text-red-600 text-sm font-bold disabled:opacity-60"
                >
                  Simulate failure
                </button>
                <button type="button" onClick={() => complete('cancelled')} disabled={busy} className="min-h-11 rounded-xl border border-gray-300 px-4 text-sm font-semibold disabled:opacity-60">Cancel checkout</button>
                <button type="button" onClick={() => complete('expired')} disabled={busy} className="min-h-11 rounded-xl border border-gray-300 px-4 text-sm font-semibold disabled:opacity-60">Simulate expiry</button>
              </div>
            ) : order.status === 'paid' ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-[#2D6A4F]">Demo payment succeeded. You’re enrolled in this demo environment.</p>
                <Link to={`/course/${order.courseId}`} className="inline-block px-4 py-2.5 rounded-xl bg-[#2D6A4F] text-white text-sm font-bold">
                  Go to course
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-red-600">Payment {order.status}. You were not charged.</p>
                <Link to={`/course/${order.courseId}`} className="text-sm font-bold text-[#2D6A4F] underline">
                  Back to course
                </Link>
              </div>
            )}
            {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
};
