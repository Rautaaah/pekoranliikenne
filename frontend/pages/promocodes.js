import React from "react";
import PromoCodesPage from "../components/promoCodesPage";

const PromoCodes = () => {
  return <PromoCodesPage />;
};

export const getStaticProps = () => {
  return {
    props: {
      title: "Redeem Zekoro Promotions - Zekoro",
    },
  };
};

export default PromoCodes;
