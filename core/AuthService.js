import axios from 'axios';

class AuthService {

    constructor(organizationId) {
        this.organizationId = organizationId;
    }

    async getAccessToken(organizationId = this.organizationId) {


        if (organizationId !== this.organizationId) {
            this.organizationId = organizationId;
            this.accessToken = null;
        }

        const config = {
            url: `https://donatello.aptuslegal.app/oauth/token/${organizationId}`,
            method: 'get',
            maxBodyLength: Infinity,
            timeout: 30000,
            headers: {
                'Authorization': process.env.AUTH_TOKEN
            }
        };

        try {
            const response = await axios(config);
            this.accessToken = response.data.access_token;
            return this.accessToken;
        } catch (error) {
            console.error('Error obteniendo token de organización', { status: error.response?.status ?? null, code: error.code ?? null });
            throw error;
        }

    }

}

export default AuthService;