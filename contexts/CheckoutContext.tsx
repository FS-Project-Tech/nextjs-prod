import { createContext, useContext, useState } from "react";

const CheckoutContext = createContext(null);

export const CheckoutProvider = ({ children }) => {
  const [shipping, setShipping] = useState(null);

  return (
    <CheckoutContext.Provider value={{ shipping, setShipping }}>
      {children}
    </CheckoutContext.Provider>
  );
};

export const useCheckout = () => useContext(CheckoutContext);