import ZekomonsSearchPage from "../../components/zekomonsPage/search";

const Page = () => <ZekomonsSearchPage />;

export const getStaticProps = () => ({
  props: {
    title: "Zekomons - Search",
    disableWebsiteTheming: true,
  },
});

export default Page;
