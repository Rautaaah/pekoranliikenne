import ZekomonsLimitedDetailsPage from "../../../components/zekomonsPage/limitedDetails";

const Page = ({ assetId }) => <ZekomonsLimitedDetailsPage assetId={assetId} />;

export const getServerSideProps = async (ctx) => {
  const assetId = Number(ctx?.params?.assetId);
  return {
    props: {
      assetId: Number.isSafeInteger(assetId) ? assetId : null,
      title: "Zekomons - Limited",
      disableWebsiteTheming: true,
    },
  };
};

export default Page;
