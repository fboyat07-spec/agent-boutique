export default function Billing() {
  const handleSubscribe = () => {
    window.location.href = "https://buy.stripe.com/xxxx";
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Abonnement</h1>
      
      <div className="bg-white shadow rounded-lg p-6 max-w-md">
        <h2 className="text-xl font-semibold mb-4">Agent Boutique Pro</h2>
        
        <div className="mb-6">
          <p className="text-3xl font-bold">€49<span className="text-lg font-normal text-gray-600">/mois</span></p>
        </div>
        
        <ul className="space-y-3 mb-6">
          <li className="flex items-center">
            <span className="text-green-500 mr-2">✓</span>
            Leads illimités
          </li>
          <li className="flex items-center">
            <span className="text-green-500 mr-2">✓</span>
            WhatsApp automation
          </li>
          <li className="flex items-center">
            <span className="text-green-500 mr-2">✓</span>
            Scoring intelligent
          </li>
          <li className="flex items-center">
            <span className="text-green-500 mr-2">✓</span>
            Relances automatiques
          </li>
          <li className="flex items-center">
            <span className="text-green-500 mr-2">✓</span>
            Dashboard analytics
          </li>
        </ul>
        
        <button 
          onClick={handleSubscribe} 
          className="w-full bg-black text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
        >
          S'abonner
        </button>
      </div>
    </div>
  );
}
