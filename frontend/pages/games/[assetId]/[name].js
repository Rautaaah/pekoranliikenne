import { useRouter } from 'next/router';
import SharedAssetPage from "../../../components/sharedAssetPage2019";
import { getProductInfoLegacy } from '../../../services/catalog';
import Head from 'next/head';
import Theme2016 from '../../../components/theme2016';

const GamePage = ({ name, description, assetId, ...props }) => {
  return (
    <>
      {name && (
        <Head>
          <title>{name} - Zekoro</title>
          <meta property="og:title" content={name} />
          <meta property="og:url" content={`https://zekoro.org/games/${assetId}/--`} />
          <meta property="og:type" content="website" />
          <meta property="og:description" content={description || `${name} on Zekoro`} />
          <meta property="og:image" content={`https://zekoro.org/Thumbs/GameIcon.ashx?assetId=${assetId}`} />
          <meta property="og:image:secure_url" content={`https://zekoro.org/Thumbs/GameIcon.ashx?assetId=${assetId}`} />
          <meta property="og:image:type" content="image/png" />
          <meta property="og:image:width" content="420" />
          <meta property="og:image:height" content="420" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={name} />
          <meta name="twitter:description" content={description || `${name} on Zekoro`} />
          <meta name="twitter:image" content={`https://zekoro.org/Thumbs/GameIcon.ashx?assetId=${assetId}`} />
          <meta name="og:site_name" content="Zekoro" />
          <meta name="theme-color" content="#007ed2" />
        </Head>
      )}
      <Theme2016>
        <SharedAssetPage idParamName='assetId' nameParamName='name' />
      </Theme2016>
    </>
  );
}
export async function getServerSideProps(context) {
  const { assetId } = context.query;
  const info = await getProductInfoLegacy(assetId);
  try {
    if (info.AssetTypeId != 9) {
      return {
        props: {
          name: null,
          description: null,
          assetId: assetId
        }
      }
    } else {
      return {
        props: {
          name: info.Name,
          description: info.Description,
          assetId: assetId
        }
      }
    }
  } catch (error) {
    console.error(error);
    return {
      props: {
        name: null,
        description: null,
        assetId: null
      }
    };
  }
}
export default GamePage;
