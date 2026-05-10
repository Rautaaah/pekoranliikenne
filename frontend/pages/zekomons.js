import React from "react";
import ZekomonsPage from "../components/zekomonsPage";

const Zekomons = () => {
  return (
    <ZekomonsPage />
  );
};

export const getStaticProps = () => {
  return {
    props: {
      title: "Zekomons - Profile",
      disableWebsiteTheming: true,
    },
  };
};

export default Zekomons;
