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
  status: 'pending' | 'paid' | 'failed' | 'cancelled';
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

  const complete = async (outcome: 'paid' | 'failed') => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/payments/test/${orderId}/complete`, { outcome });
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
          TEST PAYMENT: simulated checkout, no real money is charged.
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
            {order.status === 'pending' ? (
              <div className="flex gap-2">
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
              </div>
            ) : order.status === 'paid' ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-[#2D6A4F]">Payment confirmed. You're enrolled!</p>
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
            {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
};
