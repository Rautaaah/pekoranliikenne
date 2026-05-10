import ZekomonsLimitedsPage from "../../components/zekomonsPage/limiteds";

const Page = () => <ZekomonsLimitedsPage />;

export const getStaticProps = () => ({
  props: {
    title: "Zekomons - Limiteds",
    disableWebsiteTheming: true,
  },
});

export default Page;
