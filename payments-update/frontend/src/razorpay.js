import api from "./api.js";

const SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

// Loads Razorpay's checkout script the first time it's needed.
export function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(window.Razorpay);
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => reject(new Error("Couldn't load the payment window. Check your connection and try again."));
    document.body.appendChild(script);
  });
}

/**
 * Opens Razorpay Checkout for a held booking, then asks OUR server to verify the payment.
 * The browser's "success" callback is never trusted on its own: the server checks the signature.
 * Resolves with the confirmed booking. Rejects with { dismissed: true } if the player closes the window.
 */
export async function payForBooking({ booking, checkout }, user, description) {
  const Razorpay = await loadRazorpay();
  const proof = await new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key: checkout.keyId,
      order_id: checkout.orderId,
      amount: checkout.amount,
      currency: checkout.currency,
      name: "SlotBook",
      description,
      prefill: { name: user.name, email: user.email },
      theme: { color: "#c2410c" },
      handler: resolve,
      modal: { ondismiss: () => reject({ dismissed: true }) },
    });
    rzp.open();
  });
  const { data } = await api.post(`/bookings/${booking._id}/verify`, proof);
  return data.booking;
}
