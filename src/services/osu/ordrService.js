import axios from 'axios';
import FormData from 'form-data';

export async function createRenderJob(fileBuffer, fileName, username) {
    try {
        const formData = new FormData();
        formData.append('replayFile', fileBuffer, fileName);
        formData.append('username', username);
        
        // 🎯 GỬI KÈM API KEY CHÍNH CHỦ CỦA YUE (Bypass rate limit & tự lấy preset liên kết)
        if (process.env.ORDR_API_KEY) {
            formData.append('customApiKey', process.env.ORDR_API_KEY);
        } else {
            // Nếu chưa có API Key thì xài tạm preset name truyền tay
            formData.append('preset', 'v3 plain yue');
        }

        const response = await axios.post('https://ordr-api.issou.best/v2/renders', formData, {
            headers: formData.getHeaders(),
            timeout: 20000
        });

        if (response.data && response.data.renderID) {
            return response.data.renderID;
        }
        return null;
    } catch (error) {
        console.error('❌ Lỗi gửi job render o!rdr:', error.response?.data || error.message);
        return null;
    }
}