import React from "react";
import PromoCodesPage from "../components/promoCodesPage";

const PromoCodes = () => {
  return <PromoCodesPage />;
};

export const getStaticProps = () => {
  return {
    props: {
      title: "Redeem Sansy Promotions - Sansy",
    },
  };
};

export default PromoCodes;
