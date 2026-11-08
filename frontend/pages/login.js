import PublicLanding from "../components/publicLanding";

const LoginPage = () => {
    return <PublicLanding mode="login" />;
}

export const getServerSideProps = async () => {
    return {
        props: {
            disableWebsiteTheming: true,
            title: "Log in - Kornet",
        },
    };
};

export default LoginPage;
